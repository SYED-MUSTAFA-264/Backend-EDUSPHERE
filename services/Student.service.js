import Student from "../model/student.model.js";

async function StudentCreate(StudentData) {
 
  const { StudentName, StudentEmail, Phone, Age, Password,file_url } = StudentData;

  if (!StudentName || !StudentEmail || !Phone || !Age || !Password) {
    throw new Error("All required fields must be provided");
  }

 
  const newStudent = await Student.create({
    StudentName,
    StudentEmail,
    Phone,
    Age,
    Password,
    file_url,
  });

  return newStudent;
}

export default StudentCreate;