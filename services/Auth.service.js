import Student from "../model/student.model.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const SALT_ROUND = 10;
const JWT_SECRET = process.env.JWT_SECRET || "your_fallback_secret_key";
const JWT_EXPIRES_IN = "1d";

async function SignUpUserService(StudentData) {
  const { StudentName, StudentEmail, Password, ConfirmPassword, Role } = StudentData;

  if (!StudentName || !StudentEmail || !Password || !ConfirmPassword) {
    throw new Error("All required fields must be provided");
  }

  if (Password !== ConfirmPassword) {
    throw new Error("Passwords do not match");
  }

  const hashedPassword = await bcrypt.hash(Password, SALT_ROUND);

  const SignupStudent = await Student.create({
    StudentName,
    StudentEmail,
    Password: hashedPassword,
    Role: Role || "student",
  });

  return SignupStudent;
}

async function LoginUserService(StudentData) {
  const { StudentEmail, Password } = StudentData;

  if (!StudentEmail || !Password) {
    throw new Error("All required fields must be provided");
  }

  const LoginStudent = await Student.findOne({
    StudentEmail,
  });

  if (!LoginStudent) {
    throw new Error("Invalid credentials");
  }

  const match = await bcrypt.compare(Password, LoginStudent.Password);

  if (!match) {
    throw new Error("Invalid credentials");
  }

  const token = jwt.sign(
    {
      id: LoginStudent._id,
      email: LoginStudent.StudentEmail,
      role: LoginStudent.Role,
    },
    JWT_SECRET,
    {
      expiresIn: JWT_EXPIRES_IN,
    }
  );

  return token;
}

export default SignUpUserService;
export { LoginUserService };