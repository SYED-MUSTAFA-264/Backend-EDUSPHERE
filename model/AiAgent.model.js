// Backend/model/AiAgent.model.js
import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  questionText: { type: String, required: true },
  options: [{ type: String, required: true }],
  correctOptionIndex: { type: Number, required: true },
  selectedOptionIndex: { type: Number, default: null },
  spokenAnswerText: { type: String, default: "" },
  isCorrect: { type: Boolean, default: false },
  explanation: { type: String, default: "" },
  topicTag: { type: String, default: "Core Concept" },
});

const quizSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    studentName: { type: String, default: "Scholar" },
    examType: {
      type: String,
      enum: ["quiz", "oral"],
      default: "quiz",
      index: true,
    },
    voiceGender: {
      type: String,
      enum: ["male", "female"],
      default: "female",
    },
    title: { type: String, required: true },
    sourceFileName: { type: String, default: "" },
    difficulty: { type: String, default: "Medium" },
    status: { type: String, enum: ["Pending", "Completed"], default: "Pending" },
    questions: [questionSchema],
    totalQuestions: { type: Number, default: 20 },
    score: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    passingPercentage: { type: Number, default: 60 },
    passed: { type: Boolean, default: false },
    stars: { type: Number, default: 0 },
    grade: { type: String, default: "N/A" },
    timeTakenSeconds: { type: Number, default: 0 },
    scheduledFor: { type: Date, default: null },
    durationMinutes: { type: Number, default: 20 },
    isReattempt: { type: Boolean, default: false },
    cheatStrikes: { type: Number, default: 0 },
    autoSubmittedReason: { type: String, default: "" },
    aiFeedback: { type: String, default: "" },
    completedAt: { type: Date },
  },
  { timestamps: true }
);

const studyTaskSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    subject: { type: String, default: "General" },
    moduleName: { type: String, default: "Module 1" },
    estimatedMinutes: { type: Number, default: 45 },
    checklist: [{ type: String }],
    priority: { type: String, enum: ["Low", "Medium", "High"], default: "Medium" },
    status: { type: String, enum: ["Pending", "Completed"], default: "Pending" },
    xpReward: { type: Number, default: 40 },
    generatedByAI: { type: Boolean, default: true },
    dueDate: { type: Date },
  },
  { timestamps: true }
);

const messageSchema = new mongoose.Schema({
  role: { type: String, enum: ["user", "assistant"], required: true },
  text: { type: String, required: true },
  attachmentType: { type: String, default: "none" },
  attachmentName: { type: String, default: "" },
  attachmentPreview: { type: String, default: "" },
  createdAt: { type: Date, default: Date.now },
});

const aiChatSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    messages: [messageSchema],
  },
  { timestamps: true }
);

const bookPageSchema = new mongoose.Schema({
  pageNumber: { type: Number, required: true },
  text: { type: String, default: "" },
  drawing: { type: String, default: "" },
});

const noteBookSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    subject: { type: String, required: true, default: "General" },
    inkColor: { type: String, default: "#1e3a8a" },
    fontFamily: { type: String, default: "'Caveat', cursive" },
    pages: [bookPageSchema],
  },
  { timestamps: true }
);

const notificationSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, index: true },
    type: { type: String, default: "welcome" },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const leaderboardEntrySchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true, index: true },
    studentName: { type: String, required: true },
    phone: { type: String, default: "" },
    email: { type: String, default: "" },
    avatar: { type: String, default: "" },
    totalXp: { type: Number, default: 0 },
    level: { type: Number, default: 1 },
    avgAccuracy: { type: Number, default: 0 },
    quizzesPassed: { type: Number, default: 0 },
    tasksCompleted: { type: Number, default: 0 },
    tier: { type: String, default: "Bronze" },
  },
  { timestamps: true }
);

const scholarProfileSchema = new mongoose.Schema(
  {
    studentId: { type: String, required: true, unique: true, index: true },
    studentName: { type: String, required: true },
    studentEmail: { type: String, default: "", index: true },
    phone: { type: String, default: "", index: true },
    cleanPhone: { type: String, default: "", index: true },
    avatar: { type: String, default: "" },
    tier: { type: String, default: "Bronze" },
    totalXp: { type: Number, default: 100 },
    level: { type: Number, default: 1 },
    avgAccuracy: { type: Number, default: 0 },
    lastSeen: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const friendRequestSchema = new mongoose.Schema(
  {
    fromStudentId: { type: String, required: true, index: true },
    fromName: { type: String, required: true },
    fromPhone: { type: String, default: "" },
    fromAvatar: { type: String, default: "" },
    fromTier: { type: String, default: "Bronze" },
    toStudentId: { type: String, required: true, index: true },
    toName: { type: String, required: true },
    toPhone: { type: String, default: "" },
    toAvatar: { type: String, default: "" },
    toTier: { type: String, default: "Bronze" },
    status: {
      type: String,
      enum: ["Pending", "Accepted", "Rejected"],
      default: "Pending",
      index: true,
    },
  },
  { timestamps: true }
);

const directMessageSchema = new mongoose.Schema(
  {
    senderId: { type: String, required: true, index: true },
    senderName: { type: String, required: true },
    senderAvatar: { type: String, default: "" },
    receiverId: { type: String, required: true, index: true },
    receiverName: { type: String, default: "" },
    text: { type: String, default: "" },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "pdf", "file", "shared-note", "shared-result"],
      default: "text",
    },
    mediaUrl: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileSize: { type: String, default: "" },
    sharedPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ============================================================================
// WHATSAPP-STYLE EDUCATIONAL COMMUNITIES & COMMUNITY GROUP MESSAGES
// ============================================================================
const communityMemberSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  studentName: { type: String, required: true },
  avatar: { type: String, default: "" },
  tier: { type: String, default: "Bronze" },
  role: { type: String, enum: ["Admin", "Member"], default: "Member" },
  joinedAt: { type: Date, default: Date.now },
});

const communitySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    subject: { type: String, default: "General Education" },
    description: { type: String, default: "" },
    icon: { type: String, default: "🎓" },
    creatorId: { type: String, required: true, index: true },
    creatorName: { type: String, default: "Scholar" },
    members: [communityMemberSchema],
  },
  { timestamps: true }
);

const communityMessageSchema = new mongoose.Schema(
  {
    communityId: { type: String, required: true, index: true },
    senderId: { type: String, required: true, index: true },
    senderName: { type: String, required: true },
    senderAvatar: { type: String, default: "" },
    senderTier: { type: String, default: "Bronze" },
    text: { type: String, default: "" },
    messageType: {
      type: String,
      enum: ["text", "image", "video", "pdf", "file", "shared-note", "shared-result"],
      default: "text",
    },
    mediaUrl: { type: String, default: "" },
    fileName: { type: String, default: "" },
    fileSize: { type: String, default: "" },
    sharedPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    isEdited: { type: Boolean, default: false },
    editedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const Quiz = mongoose.model("Quiz", quizSchema);
export const StudyTask = mongoose.model("StudyTask", studyTaskSchema);
export const AiChat = mongoose.model("AiChat", aiChatSchema);
export const NoteBook = mongoose.model("NoteBook", noteBookSchema);
export const Notification = mongoose.model("Notification", notificationSchema);
export const LeaderboardEntry = mongoose.model("LeaderboardEntry", leaderboardEntrySchema);
export const ScholarProfile = mongoose.model("ScholarProfile", scholarProfileSchema);
export const FriendRequest = mongoose.model("FriendRequest", friendRequestSchema);
export const DirectMessage = mongoose.model("DirectMessage", directMessageSchema);
export const Community = mongoose.model("Community", communitySchema);
export const CommunityMessage = mongoose.model("CommunityMessage", communityMessageSchema);