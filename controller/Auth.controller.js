import SignUpUserService, { LoginUserService } from "../services/Auth.service.js";

async function SignUp(req, res) {
  try {
    const std = await SignUpUserService(req.body);

    return res.status(201).json({
      message: "User Created Successfully",
      data: std,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Something went wrong",
    });
  }
}

async function Login(req, res) {
  try {
    const token = await LoginUserService(req.body);

    return res.status(200).json({
      message: "Login Successful",
      token: token,
    });
  } catch (error) {
    return res.status(400).json({
      message: error.message || "Something went wrong",
    });
  }
}

export default SignUp;
export { Login };