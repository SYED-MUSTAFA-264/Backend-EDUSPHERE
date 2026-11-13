import { Router } from "express";
import Student from "../model/student.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = Router();

// 1. Register Route (Phone aur ProfileImage ke sath)
router.post("/register", async (req, res) => {
  try {
    const { StudentName, StudentEmail, Password, Phone, ProfileImage, Role } = req.body;

    if (!StudentName || !StudentEmail || !Password) {
      return res.status(400).json({ message: "Tamam zaroori fields bharein!" });
    }

    const existingStudent = await Student.findOne({ StudentEmail });
    if (existingStudent) {
      return res.status(400).json({ message: "Yeh email pehle se registered hai!" });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(Password, salt);

    const newStudent = await Student.create({
      StudentName,
      StudentEmail,
      Password: hashedPassword,
      Phone: Phone || "",
      ProfileImage: ProfileImage || "", // Image optional hai (agar khali ho gi to empty save hogi)
      Role: Role || "student",
    });

    return res.status(201).json({
      success: true,
      message: "Registration successful!",
      student: newStudent,
    });
  } catch (error) {
    console.error("Register Error:", error);
    return res.status(500).json({ message: error.message || "Server Error" });
  }
});

// 2. Login Route (User object me Phone aur ProfileImage bhejne ke liye)
router.post("/login", async (req, res) => {
  try {
    const { StudentEmail, Password } = req.body;

    if (!StudentEmail || !Password) {
      return res.status(400).json({ message: "Email aur Password dena zaroori hai!" });
    }

    const student = await Student.findOne({ StudentEmail });
    if (!student) {
      return res.status(404).json({ message: "Student record nahi mila!" });
    }

    const isMatch = await bcrypt.compare(Password, student.Password);
    if (!isMatch) {
      return res.status(400).json({ message: "Galat password!" });
    }

    const token = jwt.sign(
      { 
        id: student._id, 
        StudentEmail: student.StudentEmail, 
        StudentName: student.StudentName,
        Phone: student.Phone,
        ProfileImage: student.ProfileImage,
        role: student.Role || "student" 
      },
      process.env.JWT_SECRET || "super_secret_key_123",
      { expiresIn: "7d" }
    );

    return res.status(200).json({
      success: true,
      message: "Login successful!",
      token,
      user: {
        id: student._id,
        StudentName: student.StudentName,
        StudentEmail: student.StudentEmail,
        Phone: student.Phone || "",
        ProfileImage: student.ProfileImage || "",
        role: student.Role || "student",
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    return res.status(500).json({ message: error.message || "Server Error" });
  }
});

export default router;