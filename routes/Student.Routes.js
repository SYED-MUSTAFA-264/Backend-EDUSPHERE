import { Router } from "express";
import multer from "multer";
import path from "path";
import { createStudent, updateStudentProfile } from "../controller/Student.Controller.js";
import SetFileUrl from "../middleware/SetFileUrl.js";
import { authenticateToken } from "../middleware/auth.middleware.js";

const StudentRouter = Router();

// Multer (Upload) ka setup yahin par kar diya gaya hai
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "Uploads");
  },
  filename: (req, file, cb) => {
    const uniquesuffix = Date.now() + "_" + Math.round(Math.random() * 1e9);
    const filename = uniquesuffix + path.extname(file.originalname);
    cb(null, filename);
  },
});
const upload = multer({ storage });

// Routes
StudentRouter.post("/", upload.single("file"), SetFileUrl, createStudent);
StudentRouter.put("/update-profile", authenticateToken, updateStudentProfile);

export default StudentRouter;