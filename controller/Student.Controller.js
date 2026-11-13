import Student from "../model/student.model.js";
import bcrypt from "bcrypt";

// 1. Create Student (Register)
export async function createStudent(req, res) {
  try {
    const { StudentName, StudentEmail, Password, PhoneNumber } = req.body;

    if (!StudentName || !StudentEmail || !Password) {
      return res.status(400).json({ message: "Tamam fields zaroori hain!" });
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
      PhoneNumber: PhoneNumber || "",
      ProfileImage: req.fileUrl || req.body.ProfileImage || "", 
    });

    return res.status(201).json({
      message: "Student successfully create ho gaya!",
      student: newStudent,
    });
  } catch (error) {
    console.error("Create Student Error:", error);
    return res.status(500).json({ message: error.message });
  }
}

// 2. Update Student Profile (Database & Fields)
export async function updateStudentProfile(req, res) {
  try {
    const { StudentName, StudentEmail, Password, PhoneNumber, ProfileImage } = req.body;

    const userId = req.user?.id || req.user?._id;
    const userEmail = req.user?.StudentEmail || req.user?.email;

    let student = await Student.findOne({
      $or: [{ _id: userId }, { StudentEmail: userEmail }],
    });

    if (!student) {
      return res.status(404).json({ success: false, message: "Student record database me nahi mila!" });
    }

    if (StudentName) student.StudentName = StudentName;
    if (StudentEmail) student.StudentEmail = StudentEmail;
    if (PhoneNumber !== undefined) student.PhoneNumber = PhoneNumber;
    if (ProfileImage !== undefined) student.ProfileImage = ProfileImage;

    if (Password && Password.trim() !== "") {
      const salt = await bcrypt.genSalt(10);
      student.Password = await bcrypt.hash(Password, salt);
    }

    await student.save();

    return res.status(200).json({
      success: true,
      message: "Profile successfully database me update ho gayi!",
      user: {
        id: student._id,
        StudentName: student.StudentName,
        StudentEmail: student.StudentEmail,
        PhoneNumber: student.PhoneNumber,
        ProfileImage: student.ProfileImage,
        role: student.Role || "student",
      },
    });
  } catch (error) {
    console.error("Database Update Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Server Error: Database update nahi ho saka!",
    });
  }
}