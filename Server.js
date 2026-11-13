import "dotenv/config"; 
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import connectdb from "./db/Database.js";
import StudentRouter from "./routes/Student.Routes.js";
import Authrouter from "./routes/Auth.routes.js";
import AiAgentRouter from "./routes/AiAgent.routes.js"; 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5173",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use("/Uploads", express.static("Uploads"));

connectdb();

app.use("/api/auth", Authrouter);
app.use("/api/students", StudentRouter);
app.use("/api/ai-agent", AiAgentRouter); 

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});