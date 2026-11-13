async function SetFileUrl(req, res, next) {
  try {
    if (!req.file) {
      return next();
    }

    const host = req.get("host");
    const protocol = req.protocol;
    const filename = req.file.filename;

    const file_url = `${protocol}://${host}/Uploads/${filename}`;
    req.body.file_url = [file_url];

    next();
  } catch (error) {
    next(error);
  }
}

export default SetFileUrl;