// Backend/Middleware/aiUpload.middleware.js
const multer = require("multer");

// Memory storage taake PDF aur Image ka buffer seedha Gemini AI ko bheja ja sake
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/jpg",
  ];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Sirf PDF aur Images (JPG, PNG, WEBP) allowed hain!"), false);
  }
};

const aiUpload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB max file size
});

module.exports = aiUpload;