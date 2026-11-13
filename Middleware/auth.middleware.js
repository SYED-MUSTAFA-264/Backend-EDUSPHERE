import jwt from "jsonwebtoken";

export const authenticateToken = (req, res, next) => {
  try {
    const authHeader = req.headers["authorization"];
    const token = authHeader && authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({ message: "Access Denied: Token Missing!" });
    }

    // Login ke waqt jo JWT secret key use hoti hai yahan paste karein (e.g. process.env.JWT_SECRET || "your_secret_key")
    const secret = process.env.JWT_SECRET || "secretkey"; 

    jwt.verify(token, secret, (err, decodedUser) => {
      if (err) {
        return res.status(403).json({ message: "Invalid or Expired Token!" });
      }
      req.user = decodedUser;
      next();
    });
  } catch (error) {
    return res.status(500).json({ message: "Authentication Error" });
  }
};