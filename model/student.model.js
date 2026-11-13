import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    StudentName: {
      type: String,
      required: true,
    },
    StudentEmail: {
      type: String,
      required: true,
      unique: true,
    },
    Role: {
      type: String,
      default: "student",
    },
    verified: {
      type: Boolean,
      default: false,
    },
    Phone: {
      type: Number,
    },

    PhoneNumber: {
      type: String,
      default: "",
    },

    ProfileImage: {
      type: String,
      default: "",
    },
    Age: {
      type: Number,
    },
    Password: {
      type: String,
      required: true,
    },
    file_url: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

const Student = mongoose.model("Student", userSchema);

export default Student;