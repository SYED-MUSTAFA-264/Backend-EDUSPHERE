// Backend/routes/AiAgent.routes.js
import express from "express";
import multer from "multer";
import {
  askAiTutor,
  generateQuizFromPdf,
  submitQuiz,
  deleteQuiz,
  generateAiTasks,
  toggleTaskStatus,
  updateTask,
  deleteTask,
  createManualTask,
  createNoteBook,
  updateNoteBook,
  deleteNoteBook,
  createCustomNotification,
  markAllNotificationsRead,
  clearAllNotifications,
  getDashboardAiData,
  clearChatHistory,
  syncScholarProfile,
  sendFriendRequest,
  respondToFriendRequest,
  removeFriendOrRequest,
  getDirectMessages,
  sendDirectMessage,
  editDirectMessage,
  deleteDirectMessage,
  importSharedNoteBook,
} from "../controller/AiAgent.controller.js";

import {
  checkUserRoleFromDb,
  getFacultyDashboardData,
  broadcastFacultyNotice,
  assignFacultyAssessment,
  updateFacultyProfile,
  createCommunity,
  joinCommunity,
  getCommunityMessages,
  sendCommunityMessage,
  editCommunityMessage,
  deleteCommunityMessage,
  // Google Classroom Assignment System
  createClassroomAssignment,
  getClassroomAssignments,
  deleteClassroomAssignment,
  submitStudentAssignment,
  aiEvaluateSubmission,
  gradeStudentSubmission,
  addAssignmentComment,
  // Upgraded 3D Chat, Polls, Reactions, Pin & Faculty Direct Connect
  getSocialOverviewPro,
  searchScholarsPro,
  voteOnChatPoll,
  reactToChatMessage,
  togglePinChatMessage,
  sendCommunityJoinInvite,
} from "../controller/Faculty.controller.js";

const router = express.Router();

const aiUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.get("/dashboard", getDashboardAiData);
router.get("/dashboard-data", getDashboardAiData);

router.post("/chat", aiUpload.single("file"), askAiTutor);
router.delete("/chat/clear", clearChatHistory);

router.post("/quiz/generate", aiUpload.single("file"), generateQuizFromPdf);
router.post("/oral/generate", aiUpload.single("file"), generateQuizFromPdf);
router.post("/quiz/:quizId/submit", submitQuiz);
router.delete("/quiz/:quizId", deleteQuiz);

router.post("/tasks/generate", aiUpload.single("file"), generateAiTasks);
router.post("/tasks/manual", createManualTask);
router.patch("/tasks/:taskId/toggle", toggleTaskStatus);
router.put("/tasks/:taskId", updateTask);
router.delete("/tasks/:taskId", deleteTask);

router.post("/notes", createNoteBook);
router.put("/notes/:noteId", updateNoteBook);
router.delete("/notes/:noteId", deleteNoteBook);

router.post("/notifications", createCustomNotification);
router.patch("/notifications/read-all", markAllNotificationsRead);
router.delete("/notifications/clear", clearAllNotifications);

// Scholar Connect, Faculty Direct Chat, Polls & Communities Routes
router.post("/social/sync-profile", syncScholarProfile);
router.get("/social/overview", getSocialOverviewPro);
router.get("/social/search", searchScholarsPro);
router.post("/social/friend-request", sendFriendRequest);
router.patch("/social/friend-request/:requestId", respondToFriendRequest);
router.delete("/social/friend/:targetStudentId", removeFriendOrRequest);

router.get("/social/messages/:friendId", getDirectMessages);
router.post("/social/messages", aiUpload.single("file"), sendDirectMessage);
router.put("/social/messages/:messageId", editDirectMessage);
router.delete("/social/messages/:messageId", deleteDirectMessage);
router.post("/social/messages/:messageId/vote", voteOnChatPoll);
router.post("/social/messages/:messageId/react", reactToChatMessage);
router.post("/social/messages/:messageId/pin", togglePinChatMessage);
router.post("/social/communities/invite", sendCommunityJoinInvite);
router.post("/social/import-note", importSharedNoteBook);

// Educational Communities Routes
router.post("/social/communities", createCommunity);
router.post("/social/communities/:communityId/join", joinCommunity);
router.get("/social/communities/:communityId/messages", getCommunityMessages);
router.post(
  "/social/communities/:communityId/messages",
  aiUpload.single("file"),
  sendCommunityMessage
);
router.put("/social/communities/messages/:messageId", editCommunityMessage);
router.delete("/social/communities/messages/:messageId", deleteCommunityMessage);

// Faculty Command Center Routes
router.get("/faculty/check-role", checkUserRoleFromDb);
router.get("/faculty/overview", getFacultyDashboardData);
router.post("/faculty/broadcast-notice", broadcastFacultyNotice);
router.post(
  "/faculty/assign-exam",
  aiUpload.single("file"),
  assignFacultyAssessment
);
router.put("/faculty/update-profile", updateFacultyProfile);

// Google Classroom Assignment & AI Grading Routes
router.post(
  "/classroom/assignments",
  aiUpload.single("file"),
  createClassroomAssignment
);
router.get("/classroom/assignments", getClassroomAssignments);
router.delete("/classroom/assignments/:assignmentId", deleteClassroomAssignment);
router.post(
  "/classroom/assignments/:assignmentId/submit",
  aiUpload.single("file"),
  submitStudentAssignment
);
router.post(
  "/classroom/assignments/:assignmentId/submissions/:submissionId/ai-check",
  aiEvaluateSubmission
);
router.post(
  "/classroom/assignments/:assignmentId/submissions/:submissionId/grade",
  gradeStudentSubmission
);
router.post(
  "/classroom/assignments/:assignmentId/comments",
  addAssignmentComment
);

export default router;