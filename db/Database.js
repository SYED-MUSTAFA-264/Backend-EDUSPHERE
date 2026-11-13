import mongoose from "mongoose";

async function connectdb() {
  try {
    await mongoose.connect("mongodb://localhost:27017/Student");
    console.log("Database Connected Successfully");
  } catch (error) {
    console.error("Database Connection Failed:", error.message);
    process.exit(1);
  }
}

export default connectdb;