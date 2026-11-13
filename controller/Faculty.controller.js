// Backend/controller/Faculty.controller.js
import fs from "fs";
import mongoose from "mongoose";
import {
  Quiz,
  Notification,
  LeaderboardEntry,
  ScholarProfile,
  FriendRequest,
  DirectMessage,
} from "../model/AiAgent.model.js";
import {
  StudyCommunity,
  getDirectMessages,
  sendDirectMessage,
  editDirectMessage,
  deleteDirectMessage,
} from "./AiAgent.controller.js";

// ============================================================================
// GOOGLE CLASSROOM ASSIGNMENT SCHEMA
// ============================================================================
const classroomAssignmentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: "" },
    subject: { type: String, required: true },
    board: { type: String, default: "Core Curriculum" },
    totalMarks: { type: Number, enum: [20, 50, 100], default: 100 },
    dueDate: { type: Date, required: true },
    targetType: { type: String, enum: ["ALL", "SPECIFIC"], default: "ALL" },
    assignedStudentIds: [{ type: String }],
    referenceFileUrl: { type: String, default: "" },
    referenceFileName: { type: String, default: "" },
    referenceFileType: { type: String, default: "none" },
    facultyId: { type: String, required: true },
    facultyName: { type: String, default: "Faculty" },
    submissions: [
      {
        studentId: { type: String, required: true },
        studentName: { type: String, default: "Student" },
        studentEmail: { type: String, default: "" },
        studentPhone: { type: String, default: "" },
        studentAvatar: { type: String, default: "" },
        submissionRank: { type: Number, default: 1 },
        submittedAt: { type: Date, default: Date.now },
        answerText: { type: String, default: "" },
        extractedPdfText: { type: String, default: "" },
        fileUrl: { type: String, default: "" },
        fileName: { type: String, default: "" },
        fileType: { type: String, default: "none" },
        status: {
          type: String,
          enum: ["Submitted", "Graded"],
          default: "Submitted",
        },
        obtainedMarks: { type: Number, default: null },
        percentage: { type: Number, default: null },
        grade: { type: String, default: "" },
        stars: { type: Number, default: 0 },
        feedback: { type: String, default: "" },
        aiSuggestedMarks: { type: Number, default: null },
        aiSuggestedStars: { type: Number, default: null },
        aiSuggestedFeedback: { type: String, default: "" },
        gradedAt: { type: Date, default: null },
      },
    ],
    comments: [
      {
        senderId: { type: String, required: true },
        senderName: { type: String, default: "User" },
        senderRole: { type: String, default: "student" },
        studentThreadId: { type: String, default: "PUBLIC" },
        text: { type: String, required: true },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const ClassroomAssignment =
  mongoose.models.ClassroomAssignment ||
  mongoose.model("ClassroomAssignment", classroomAssignmentSchema);

console.log("FACULTY + CLASSROOM + 3D POLLS & DIRECT MESSENGER ENGINE LOADED!");

const DUMMY_STUDENT_IDS = [
  "scholar_ayesha_01",
  "scholar_hamza_02",
  "scholar_zainab_03",
  "scholar_bilal_04",
  "scholar_usman_05",
  "default_student",
  "faculty_user",
  "faculty_professor_01",
];

const DUMMY_NAMES_LIST = [
  "Ayesha Siddiqui",
  "Hamza Tariq",
  "Zainab Raza",
  "Bilal Ahmed",
  "Usman Farooq",
  "You (Current Scholar)",
  "Scholar",
  "Default Student",
];

const getFacultyId = (req) =>
  req.query?.studentId ||
  req.body?.studentId ||
  req.body?.facultyId ||
  req.user?.id ||
  req.user?._id ||
  req.user?.StudentEmail ||
  req.user?.email ||
  "faculty_user";

const getFacultyName = (req) =>
  req.query?.studentName ||
  req.body?.studentName ||
  req.body?.facultyName ||
  req.user?.StudentName ||
  req.user?.name ||
  "Faculty";

const getFileBuffer = (file) => {
  if (!file) return null;
  if (file.buffer) return file.buffer;
  if (file.path && fs.existsSync(file.path)) return fs.readFileSync(file.path);
  return null;
};

const getFileDataUri = (file) => {
  const buf = getFileBuffer(file);
  if (!buf) return "";
  const mime = file.mimetype || "application/octet-stream";
  return `data:${mime};base64,${buf.toString("base64")}`;
};

const normalizePhoneDigits = (phoneStr = "") => {
  const digits = String(phoneStr || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("92") && digits.length >= 12) {
    return "0" + digits.slice(2);
  }
  return digits;
};

const computeTierBadge = (xp = 0, accuracy = 0) => {
  const scoreMetric = xp + accuracy * 2;
  if (scoreMetric >= 750 || xp >= 650) return "Diamond";
  if (scoreMetric >= 500 || xp >= 420) return "Platinum";
  if (scoreMetric >= 300 || xp >= 240) return "Gold";
  if (scoreMetric >= 140 || xp >= 100) return "Silver";
  return "Bronze";
};

const pushNotification = async ({ studentId, type, title, message }) => {
  try {
    if (!studentId) return null;
    return await Notification.create({
      studentId,
      type,
      title,
      message,
      isRead: false,
    });
  } catch (e) {
    return null;
  }
};

// ============================================================================
// PURGE DUMMY USERS & RETURN REGISTERED STUDENTS + REGISTERED FACULTY MEMBERS
// ============================================================================
export const purgeDummyAndSyncRealStudents = async () => {
  const facultyProfilesList = [];
  try {
    await LeaderboardEntry.deleteMany({
      $or: [
        { studentId: { $in: DUMMY_STUDENT_IDS } },
        { studentName: { $in: DUMMY_NAMES_LIST } },
        { email: /@edusphere\.edu$/i },
      ],
    });

    await ScholarProfile.deleteMany({
      $or: [
        { studentId: { $in: DUMMY_STUDENT_IDS } },
        { studentName: { $in: DUMMY_NAMES_LIST } },
        { studentEmail: /@edusphere\.edu$/i },
      ],
    });

    await StudyCommunity.deleteMany({
      communityId: {
        $in: ["community_cs_web_hub", "community_physics_math_lab"],
      },
    });

    if (!mongoose.connection || !mongoose.connection.db) return facultyProfilesList;

    const collections = await mongoose.connection.db.listCollections().toArray();
    const userCols = collections.filter(
      (c) =>
        /student|user|auth|register|account|member|faculty/i.test(c.name) &&
        !/aichats|studytasks|quizzes|notebooks|notifications|friendrequests|directmessages|leaderboardentries|scholarprofiles|studycommunities|classroomassignments/i.test(
          c.name
        )
    );

    const validStudentIds = new Set();
    const seenEmails = new Set();
    const seenFacultyEmails = new Set();

    for (const colInfo of userCols) {
      const docs = await mongoose.connection.db
        .collection(colInfo.name)
        .find({})
        .limit(500)
        .toArray();

      for (const doc of docs) {
        const stEmail = String(
          doc.StudentEmail || doc.studentEmail || doc.email || doc.Email || ""
        )
          .trim()
          .toLowerCase();

        const stName = String(
          doc.StudentName ||
            doc.studentName ||
            doc.fullName ||
            doc.FullName ||
            doc.name ||
            doc.Name ||
            ""
        ).trim();

        const stPhone = String(
          doc.Phone ||
            doc.phone ||
            doc.StudentPhone ||
            doc.phoneNumber ||
            doc.mobile ||
            ""
        ).trim();

        const stAvatar = String(
          doc.ProfileImage || doc.profileImage || doc.avatar || ""
        ).trim();

        const docRole = String(doc.role || doc.Role || "student")
          .trim()
          .toLowerCase();

        if (!stEmail || !stName) continue;
        if (DUMMY_NAMES_LIST.includes(stName)) continue;
        if (/@edusphere\.edu$/i.test(stEmail)) continue;

        const stId = String(doc._id || stEmail);

        if (docRole === "faculty" || docRole === "admin") {
          if (docRole === "faculty" && !seenFacultyEmails.has(stEmail)) {
            seenFacultyEmails.add(stEmail);
            facultyProfilesList.push({
              studentId: stId,
              studentName: stName,
              studentEmail: stEmail,
              phone: stPhone,
              cleanPhone: normalizePhoneDigits(stPhone),
              avatar: stAvatar,
              role: "faculty",
              isFaculty: true,
              tier: "Faculty",
            });
          }
          await LeaderboardEntry.deleteMany({
            $or: [{ studentId: stId }, { studentId: stEmail }, { email: stEmail }],
          });
          await ScholarProfile.deleteMany({
            $or: [
              { studentId: stId },
              { studentId: stEmail },
              { studentEmail: stEmail },
            ],
          });
          continue;
        }

        if (seenEmails.has(stEmail)) continue;
        seenEmails.add(stEmail);
        validStudentIds.add(stId);

        if (stId !== stEmail) {
          await LeaderboardEntry.deleteMany({ studentId: stEmail });
          await ScholarProfile.deleteMany({ studentId: stEmail });
        }

        const studentQuizzes = await Quiz.find({
          studentId: { $in: [stId, stEmail].filter(Boolean) },
          status: "Completed",
        });

        const passedCount = studentQuizzes.filter(
          (q) => q.passed || (q.percentage || 0) >= 60
        ).length;

        const avgAccuracy =
          studentQuizzes.length > 0
            ? Math.round(
                studentQuizzes.reduce((acc, q) => acc + (q.percentage || 0), 0) /
                  studentQuizzes.length
              )
            : 0;

        const existingLb = await LeaderboardEntry.findOne({ studentId: stId });
        const quizXp = studentQuizzes.reduce((s, q) => s + (q.score || 0) * 10, 0);
        const totalXp = Math.max(existingLb?.totalXp || 100, 100 + quizXp);
        const level = Math.floor(totalXp / 150) + 1;
        const tier = computeTierBadge(totalXp, avgAccuracy);

        await LeaderboardEntry.findOneAndUpdate(
          { studentId: stId },
          {
            studentId: stId,
            studentName: stName,
            phone: stPhone,
            email: stEmail,
            avatar: stAvatar,
            totalXp,
            level,
            avgAccuracy,
            quizzesPassed: passedCount,
            tier,
          },
          { upsert: true, new: true }
        );

        await ScholarProfile.findOneAndUpdate(
          { studentId: stId },
          {
            studentId: stId,
            studentName: stName,
            studentEmail: stEmail,
            phone: stPhone,
            cleanPhone: normalizePhoneDigits(stPhone),
            avatar: stAvatar,
            tier,
            totalXp,
            level,
            avgAccuracy,
          },
          { upsert: true, new: true }
        );
      }
    }

    const validArr = Array.from(validStudentIds);
    await LeaderboardEntry.deleteMany({ studentId: { $nin: validArr } });
    await ScholarProfile.deleteMany({ studentId: { $nin: validArr } });
  } catch (e) {}
  return facultyProfilesList;
};

// ============================================================================
// UPGRADED SOCIAL OVERVIEW (FACULTY <-> STUDENT DIRECT CHAT WITHOUT REQUESTS)
// ============================================================================
const formatLastMsgPreview = (lastMsg) => {
  if (!lastMsg) return null;
  const cType = lastMsg.sharedPayload?.cardType;
  let text = lastMsg.text || "";
  if (cType === "poll") {
    text = `Poll: ${lastMsg.sharedPayload?.question || "Vote now"}`;
  } else if (cType === "community-invite") {
    text = `Community Invite: ${lastMsg.sharedPayload?.communityName || "Join Group"}`;
  } else if (lastMsg.messageType === "shared-note") {
    text = `Shared 3D Notebook: ${lastMsg.sharedPayload?.title || "Notes"}`;
  } else if (lastMsg.messageType === "shared-result") {
    text = `Shared Scorecard (${lastMsg.sharedPayload?.percentage || 0}%)`;
  } else if (lastMsg.messageType && lastMsg.messageType !== "text") {
    text = `Sent a ${lastMsg.messageType} (${lastMsg.fileName || "Media"})`;
  }
  return {
    text,
    createdAt: lastMsg.createdAt,
    senderId: lastMsg.senderId,
  };
};

export const getSocialOverviewPro = async (req, res) => {
  try {
    const studentId = getFacultyId(req);
    const studentName = getFacultyName(req);
    const phone = req.query?.phone || "";
    const avatar = req.query?.avatar || "";
    const email = String(req.query?.email || "").trim().toLowerCase();
    const roleParam = String(req.query?.role || "").trim().toLowerCase();

    const facultyMembers = await purgeDummyAndSyncRealStudents();

    const isCallerFaculty =
      roleParam === "faculty" ||
      facultyMembers.some(
        (f) =>
          String(f.studentId) === String(studentId) ||
          (email && String(f.studentEmail).toLowerCase() === email)
      );

    const myProfile = (await ScholarProfile.findOne({ studentId })) || {
      studentId,
      studentName,
      studentEmail: email,
      phone,
      avatar,
      role: isCallerFaculty ? "faculty" : "student",
    };

    const allScholars = await ScholarProfile.find({
      studentId: { $ne: studentId },
    })
      .sort({ totalXp: -1 })
      .limit(150);

    const allRequests = await FriendRequest.find({
      $or: [{ fromStudentId: studentId }, { toStudentId: studentId }],
    }).sort({ updatedAt: -1 });

    const acceptedFriendIds = new Set();
    const incomingRequests = [];
    const outgoingRequests = [];

    for (const r of allRequests) {
      if (r.status === "Accepted") {
        const otherId =
          r.fromStudentId === studentId ? r.toStudentId : r.fromStudentId;
        if (otherId && otherId !== studentId) acceptedFriendIds.add(otherId);
      } else if (r.status === "Pending") {
        if (r.toStudentId === studentId) {
          const senderProf = await ScholarProfile.findOne({
            studentId: r.fromStudentId,
          });
          incomingRequests.push({
            ...r.toObject(),
            fromName: senderProf?.studentName || r.fromName,
            fromPhone: senderProf?.phone || r.fromPhone,
            fromAvatar: senderProf?.avatar || r.fromAvatar,
            fromTier: senderProf?.tier || r.fromTier || "Bronze",
            fromXp: senderProf?.totalXp || 100,
          });
        } else if (r.fromStudentId === studentId) {
          const receiverProf = await ScholarProfile.findOne({
            studentId: r.toStudentId,
          });
          outgoingRequests.push({
            ...r.toObject(),
            toName: receiverProf?.studentName || r.toName,
            toPhone: receiverProf?.phone || r.toPhone,
            toAvatar: receiverProf?.avatar || r.toAvatar,
            toTier: receiverProf?.tier || r.toTier || "Bronze",
            toXp: receiverProf?.totalXp || 100,
          });
        }
      }
    }

    // Build Faculty Mentors list (direct messaging without friend requests)
    const enrichedFacultyContacts = [];
    for (const fac of facultyMembers) {
      if (String(fac.studentId) === String(studentId)) continue;
      const lastMsg = await DirectMessage.findOne({
        $or: [
          { senderId: studentId, receiverId: fac.studentId },
          { senderId: fac.studentId, receiverId: studentId },
        ],
      }).sort({ createdAt: -1 });

      const unreadCount = await DirectMessage.countDocuments({
        senderId: fac.studentId,
        receiverId: studentId,
        isRead: false,
      });

      enrichedFacultyContacts.push({
        ...fac,
        isFaculty: true,
        relation: "faculty-direct",
        unreadCount,
        lastMessage: formatLastMsgPreview(lastMsg),
      });
    }

    const friendsList = [];
    if (isCallerFaculty) {
      // Faculty sees all registered students directly in active contacts without friend request
      for (const sc of allScholars) {
        const lastMsg = await DirectMessage.findOne({
          $or: [
            { senderId: studentId, receiverId: sc.studentId },
            { senderId: sc.studentId, receiverId: studentId },
          ],
        }).sort({ createdAt: -1 });

        const unreadCount = await DirectMessage.countDocuments({
          senderId: sc.studentId,
          receiverId: studentId,
          isRead: false,
        });

        friendsList.push({
          ...sc.toObject(),
          tier: computeTierBadge(sc.totalXp, sc.avgAccuracy),
          relation: "friends",
          unreadCount,
          lastMessage: formatLastMsgPreview(lastMsg),
        });
      }
    } else {
      // Student sees accepted student friends + all Faculty mentors directly
      for (const facContact of enrichedFacultyContacts) {
        friendsList.push(facContact);
      }

      const friendIdsArr = Array.from(acceptedFriendIds);
      const friendProfiles = await ScholarProfile.find({
        studentId: { $in: friendIdsArr },
      });
      const profMap = new Map();
      friendProfiles.forEach((fp) => profMap.set(fp.studentId, fp));

      for (const fId of friendIdsArr) {
        const fp = profMap.get(fId);
        if (!fp) continue;

        const lastMsg = await DirectMessage.findOne({
          $or: [
            { senderId: studentId, receiverId: fId },
            { senderId: fId, receiverId: studentId },
          ],
        }).sort({ createdAt: -1 });

        const unreadCount = await DirectMessage.countDocuments({
          senderId: fId,
          receiverId: studentId,
          isRead: false,
        });

        friendsList.push({
          studentId: fId,
          studentName: fp.studentName,
          phone: fp.phone || "",
          studentEmail: fp.studentEmail || "",
          avatar: fp.avatar || "",
          tier: fp.tier || "Bronze",
          totalXp: fp.totalXp || 100,
          level: fp.level || 1,
          avgAccuracy: fp.avgAccuracy || 0,
          lastSeen: fp.lastSeen || null,
          relation: "friends",
          unreadCount,
          lastMessage: formatLastMsgPreview(lastMsg),
        });
      }
    }

    friendsList.sort((a, b) => {
      const tA = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const tB = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;
      return tB - tA;
    });

    const studentDirectory = allScholars.map((sc) => {
      let relation = isCallerFaculty ? "friends" : "none";
      let reqId = null;
      if (!isCallerFaculty) {
        if (acceptedFriendIds.has(sc.studentId)) {
          relation = "friends";
        } else {
          const outReq = outgoingRequests.find(
            (o) => o.toStudentId === sc.studentId
          );
          const inReq = incomingRequests.find(
            (i) => i.fromStudentId === sc.studentId
          );
          if (outReq) {
            relation = "request-sent";
            reqId = outReq._id;
          } else if (inReq) {
            relation = "request-received";
            reqId = inReq._id;
          }
        }
      }

      return {
        ...sc.toObject(),
        isFaculty: false,
        tier: computeTierBadge(sc.totalXp, sc.avgAccuracy),
        relation,
        requestId: reqId,
      };
    });

    const directory = [...enrichedFacultyContacts, ...studentDirectory];

    const rawCommunities = await StudyCommunity.find({}).sort({
      createdAt: -1,
    });
    const communities = [];
    for (const comm of rawCommunities) {
      const lastCommMsg = await DirectMessage.findOne({
        receiverId: comm.communityId,
      }).sort({ createdAt: -1 });

      const isMember =
        isCallerFaculty ||
        (comm.members || []).some(
          (m) => String(m.studentId) === String(studentId)
        );

      communities.push({
        ...comm.toObject(),
        isCommunity: true,
        studentId: comm.communityId,
        studentName: comm.name,
        isMember,
        membersCount: (comm.members || []).length,
        lastMessage: formatLastMsgPreview(lastCommMsg),
      });
    }

    return res.status(200).json({
      success: true,
      myProfile,
      isCallerFaculty,
      facultyContacts: enrichedFacultyContacts,
      friends: friendsList,
      incomingRequests,
      outgoingRequests,
      directory,
      communities,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const searchScholarsPro = async (req, res) => {
  try {
    const studentId = getFacultyId(req);
    const rawQuery = String(req.query?.q || "").trim();
    const roleParam = String(req.query?.role || "").toLowerCase();

    const facultyMembers = await purgeDummyAndSyncRealStudents();
    const isCallerFaculty =
      roleParam === "faculty" ||
      facultyMembers.some((f) => String(f.studentId) === String(studentId));

    const allRequests = await FriendRequest.find({
      $or: [{ fromStudentId: studentId }, { toStudentId: studentId }],
    });

    const getRelationStatus = (targetId) => {
      if (isCallerFaculty) return { relation: "friends", requestId: null };
      const accepted = allRequests.find(
        (r) =>
          r.status === "Accepted" &&
          ((r.fromStudentId === studentId && r.toStudentId === targetId) ||
            (r.fromStudentId === targetId && r.toStudentId === studentId))
      );
      if (accepted) return { relation: "friends", requestId: accepted._id };

      const sent = allRequests.find(
        (r) =>
          r.status === "Pending" &&
          r.fromStudentId === studentId &&
          r.toStudentId === targetId
      );
      if (sent) return { relation: "request-sent", requestId: sent._id };

      const received = allRequests.find(
        (r) =>
          r.status === "Pending" &&
          r.fromStudentId === targetId &&
          r.toStudentId === studentId
      );
      if (received) return { relation: "request-received", requestId: received._id };

      return { relation: "none", requestId: null };
    };

    const qLower = rawQuery.toLowerCase();
    const cleanDigits = normalizePhoneDigits(rawQuery);

    const matchedFaculty = facultyMembers
      .filter((f) => {
        if (String(f.studentId) === String(studentId)) return false;
        if (!rawQuery) return true;
        return (
          String(f.studentName || "").toLowerCase().includes(qLower) ||
          String(f.studentEmail || "").toLowerCase().includes(qLower) ||
          String(f.phone || "").toLowerCase().includes(qLower) ||
          (cleanDigits.length >= 2 &&
            String(f.cleanPhone || "").includes(cleanDigits))
        );
      })
      .map((f) => ({
        ...f,
        isFaculty: true,
        tier: "Faculty",
        relation: "faculty-direct",
        requestId: null,
      }));

    let matchedProfiles = [];
    if (!rawQuery) {
      matchedProfiles = await ScholarProfile.find({
        studentId: { $ne: studentId },
      })
        .sort({ totalXp: -1 })
        .limit(80);
    } else {
      const rawDigitsOnly = rawQuery.replace(/\D/g, "");
      const safeRegex = new RegExp(
        rawQuery.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "i"
      );

      const orConditions = [
        { studentName: safeRegex },
        { studentEmail: safeRegex },
        { phone: safeRegex },
      ];
      if (cleanDigits.length >= 2) {
        orConditions.push({ cleanPhone: new RegExp(cleanDigits, "i") });
      }
      if (rawDigitsOnly.length >= 2) {
        orConditions.push({ phone: new RegExp(rawDigitsOnly, "i") });
      }

      matchedProfiles = await ScholarProfile.find({
        studentId: { $ne: studentId },
        $or: orConditions,
      })
        .sort({ totalXp: -1 })
        .limit(80);
    }

    const studentResults = matchedProfiles.map((p) => {
      const rel = getRelationStatus(p.studentId);
      return {
        ...p.toObject(),
        isFaculty: false,
        tier: computeTierBadge(p.totalXp, p.avgAccuracy),
        relation: rel.relation,
        requestId: rel.requestId,
      };
    });

    return res.status(200).json({
      success: true,
      results: [...matchedFaculty, ...studentResults],
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============================================================================
// INTERACTIVE POLL VOTING, EMOJI REACTIONS, PINNING & COMMUNITY INVITES
// ============================================================================
export const voteOnChatPoll = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { optionIndex, voterId, voterName = "Scholar" } = req.body;
    const resolvedVoterId = voterId || getFacultyId(req);

    const msg = await DirectMessage.findById(messageId);
    if (!msg || !msg.sharedPayload || msg.sharedPayload.cardType !== "poll") {
      return res.status(404).json({
        success: false,
        message: "Poll not found.",
      });
    }

    const payload = JSON.parse(JSON.stringify(msg.sharedPayload));
    const options = Array.isArray(payload.options) ? payload.options : [];
    const targetIdx = Number(optionIndex);

    if (targetIdx < 0 || targetIdx >= options.length) {
      return res.status(400).json({
        success: false,
        message: "Invalid poll option.",
      });
    }

    options.forEach((opt, idx) => {
      if (!Array.isArray(opt.voters)) opt.voters = [];
      if (idx !== targetIdx) {
        opt.voters = opt.voters.filter(
          (v) => String(v.userId) !== String(resolvedVoterId)
        );
      }
    });

    const targetVoters = options[targetIdx].voters || [];
    const alreadyVoted = targetVoters.some(
      (v) => String(v.userId) === String(resolvedVoterId)
    );

    if (alreadyVoted) {
      options[targetIdx].voters = targetVoters.filter(
        (v) => String(v.userId) !== String(resolvedVoterId)
      );
    } else {
      options[targetIdx].voters = [
        ...targetVoters,
        { userId: String(resolvedVoterId), userName: voterName },
      ];
    }

    payload.options = options;
    msg.sharedPayload = payload;
    msg.markModified("sharedPayload");
    await msg.save();

    return res.status(200).json({
      success: true,
      message: msg,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const reactToChatMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { emoji = "👍", userId } = req.body;
    const resolvedUserId = String(userId || getFacultyId(req));

    const msg = await DirectMessage.findById(messageId);
    if (!msg) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    const payload =
      msg.sharedPayload && typeof msg.sharedPayload === "object"
        ? JSON.parse(JSON.stringify(msg.sharedPayload))
        : {};

    const reactions = payload.reactions || {};
    const list = Array.isArray(reactions[emoji]) ? reactions[emoji] : [];

    if (list.includes(resolvedUserId)) {
      reactions[emoji] = list.filter((id) => id !== resolvedUserId);
      if (reactions[emoji].length === 0) delete reactions[emoji];
    } else {
      reactions[emoji] = [...list, resolvedUserId];
    }

    payload.reactions = reactions;
    msg.sharedPayload = payload;
    msg.markModified("sharedPayload");
    await msg.save();

    return res.status(200).json({
      success: true,
      message: msg,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const togglePinChatMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const msg = await DirectMessage.findById(messageId);
    if (!msg) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    const payload =
      msg.sharedPayload && typeof msg.sharedPayload === "object"
        ? JSON.parse(JSON.stringify(msg.sharedPayload))
        : {};

    payload.isPinned = !payload.isPinned;
    msg.sharedPayload = payload;
    msg.markModified("sharedPayload");
    await msg.save();

    return res.status(200).json({
      success: true,
      message: msg,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const sendCommunityJoinInvite = async (req, res) => {
  try {
    const senderId = getFacultyId(req);
    const {
      senderName = "Scholar",
      senderAvatar = "",
      targetStudentId,
      targetStudentName = "Scholar",
      communityId,
      communityName = "Study Community",
      communitySubject = "General Study",
    } = req.body;

    if (!targetStudentId || !communityId) {
      return res.status(400).json({
        success: false,
        message: "Target student and community are required.",
      });
    }

    const invitePayload = {
      cardType: "community-invite",
      communityId,
      communityName,
      communitySubject,
      inviterId: senderId,
      inviterName: senderName,
    };

    const createdMsg = await DirectMessage.create({
      senderId,
      senderName,
      senderAvatar,
      receiverId: targetStudentId,
      receiverName: targetStudentName,
      text: `${senderName} invited you to join the Study Community "${communityName}" (${communitySubject}).`,
      messageType: "text",
      sharedPayload: invitePayload,
      isRead: false,
    });

    await pushNotification({
      studentId: targetStudentId,
      type: "community-invite",
      title: `Community Join Request: "${communityName}"`,
      message: `${senderName} invited you to join "${communityName}" (${communitySubject}). Open Scholar Chat to accept!`,
    });

    return res.status(201).json({
      success: true,
      message: `Community join invite sent to ${targetStudentName}!`,
      chatMessage: createdMsg,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============================================================================
// 1. CHECK LIVE USER ROLE DIRECTLY FROM MONGODB
// ============================================================================
export const checkUserRoleFromDb = async (req, res) => {
  try {
    const email = String(req.query?.email || "").trim();
    const userId = String(req.query?.studentId || "").trim();

    if (!mongoose.connection || !mongoose.connection.db) {
      return res.status(200).json({ success: true, role: "student" });
    }

    const collections = await mongoose.connection.db.listCollections().toArray();
    const userCols = collections.filter(
      (c) =>
        /student|user|auth|register|account|faculty/i.test(c.name) &&
        !/aichats|studytasks|quizzes|notebooks|notifications|friendrequests|directmessages|leaderboardentries|scholarprofiles|studycommunities|classroomassignments/i.test(
          c.name
        )
    );

    for (const col of userCols) {
      const orFilters = [];
      if (email) {
        orFilters.push(
          { StudentEmail: new RegExp(`^${email}$`, "i") },
          { email: new RegExp(`^${email}$`, "i") }
        );
      }
      if (userId && mongoose.Types.ObjectId.isValid(userId)) {
        orFilters.push({ _id: new mongoose.Types.ObjectId(userId) });
      }
      if (orFilters.length === 0) continue;

      const foundUser = await mongoose.connection.db
        .collection(col.name)
        .findOne({ $or: orFilters });

      if (foundUser) {
        const dbRole = String(
          foundUser.role || foundUser.Role || "student"
        ).toLowerCase();
        return res.status(200).json({
          success: true,
          role: dbRole,
          user: {
            StudentName: foundUser.StudentName || foundUser.name || "Faculty",
            StudentEmail: foundUser.StudentEmail || foundUser.email || email,
            Phone: foundUser.Phone || foundUser.phone || "",
            ProfileImage: foundUser.ProfileImage || foundUser.avatar || "",
            role: dbRole,
          },
        });
      }
    }

    return res.status(200).json({ success: true, role: "student" });
  } catch (e) {
    return res.status(200).json({ success: true, role: "student" });
  }
};

// ============================================================================
// 2. GET COMPLETE FACULTY DASHBOARD DATA
// ============================================================================
export const getFacultyDashboardData = async (req, res) => {
  try {
    const facultyId = getFacultyId(req);
    const facultyName = getFacultyName(req);

    await purgeDummyAndSyncRealStudents();

    const allScholars = await ScholarProfile.find({
      studentId: { $ne: facultyId },
    }).sort({ totalXp: -1 });

    const rawLeaderboard = await LeaderboardEntry.find({
      studentId: { $ne: facultyId },
    })
      .sort({ totalXp: -1, avgAccuracy: -1 })
      .limit(100);

    const leaderboard = rawLeaderboard.map((entry, idx) => ({
      ...entry.toObject(),
      rank: idx + 1,
      tier: computeTierBadge(entry.totalXp, entry.avgAccuracy),
    }));

    const scholarMap = new Map();
    allScholars.forEach((s) => {
      scholarMap.set(String(s.studentId), s);
      if (s.studentEmail) scholarMap.set(String(s.studentEmail).toLowerCase(), s);
    });

    const allQuizzes = await Quiz.find({}).sort({ createdAt: -1 }).limit(150);
    const registeredQuizzes = allQuizzes.filter(
      (q) =>
        scholarMap.has(String(q.studentId)) ||
        scholarMap.has(String(q.studentId).toLowerCase())
    );

    const completedExams = registeredQuizzes.filter(
      (q) => q.status === "Completed" || Boolean(q.completedAt)
    );
    const pendingExams = registeredQuizzes.filter((q) => q.status === "Pending");
    const passedExams = completedExams.filter(
      (q) => q.passed || (q.percentage || 0) >= 60
    );

    const classAvgAccuracy =
      completedExams.length > 0
        ? Math.round(
            completedExams.reduce((acc, q) => acc + (q.percentage || 0), 0) /
              completedExams.length
          )
        : 0;

    const passRatePercent =
      completedExams.length > 0
        ? Math.round((passedExams.length / completedExams.length) * 100)
        : 0;

    const enrichedSubmissions = registeredQuizzes.map((q) => {
      const st =
        scholarMap.get(String(q.studentId)) ||
        scholarMap.get(String(q.studentId).toLowerCase());
      return {
        ...q.toObject(),
        studentName: st?.studentName || q.studentName || "Registered Student",
        studentPhone: st?.phone || "",
        studentTier: st?.tier || "Bronze",
      };
    });

    const assignments = await ClassroomAssignment.find({}).sort({
      createdAt: -1,
    });

    const existingNotifs = await Notification.countDocuments({
      studentId: facultyId,
    });
    if (existingNotifs === 0) {
      await pushNotification({
        studentId: facultyId,
        type: "welcome",
        title: `Welcome ${facultyName}`,
        message:
          "Your Faculty Portal is active. Assign classwork, evaluate student submissions, and message any student directly.",
      });
    }

    const notifications = await Notification.find({ studentId: facultyId })
      .sort({ createdAt: -1 })
      .limit(40);

    const communities = await StudyCommunity.find({}).sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      metrics: {
        totalScholars: allScholars.length,
        totalExamsConducted: completedExams.length,
        pendingAssignedExams: pendingExams.length,
        totalAssignments: assignments.length,
        classAvgAccuracy,
        passRatePercent,
        activeCommunities: communities.length,
      },
      scholars: allScholars.map((s, idx) => ({
        ...s.toObject(),
        rank: idx + 1,
        tier: computeTierBadge(s.totalXp, s.avgAccuracy),
      })),
      submissions: enrichedSubmissions,
      assignments,
      leaderboard,
      notifications,
      communities,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============================================================================
// 3. GOOGLE CLASSROOM ASSIGNMENTS: CREATE, LIST, SUBMIT (#1 RANK), AI CHECK & GRADE
// ============================================================================
export const createClassroomAssignment = async (req, res) => {
  try {
    const facultyId = getFacultyId(req);
    const {
      facultyName = "Faculty",
      title = "",
      description = "",
      subject = "Computer Science",
      totalMarks = 100,
      dueDate = "",
      targetType = "ALL",
      assignedStudentIds: rawStudentIds = "[]",
    } = req.body;
    const file = req.file;

    if (!title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter an Assignment Title.",
      });
    }

    if (!dueDate) {
      return res.status(400).json({
        success: false,
        message: "Please select a Due Date & Time for the assignment timer.",
      });
    }

    const parsedDue = new Date(dueDate);
    if (Number.isNaN(parsedDue.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid Due Date format.",
      });
    }

    const validMarks = [20, 50, 100].includes(Number(totalMarks))
      ? Number(totalMarks)
      : 100;

    let parsedStudentIds = [];
    try {
      parsedStudentIds =
        typeof rawStudentIds === "string"
          ? JSON.parse(rawStudentIds)
          : Array.isArray(rawStudentIds)
          ? rawStudentIds
          : [];
    } catch (e) {
      parsedStudentIds = [];
    }

    let referenceFileUrl = "";
    let referenceFileName = "";
    let referenceFileType = "none";

    if (file) {
      referenceFileUrl = getFileDataUri(file);
      referenceFileName = file.originalname || "Attachment";
      if (file.mimetype === "application/pdf") referenceFileType = "pdf";
      else if (file.mimetype?.startsWith("image/")) referenceFileType = "image";
      else if (file.mimetype?.startsWith("video/")) referenceFileType = "video";
      else referenceFileType = "file";
    }

    let recipientScholars = [];
    if (targetType === "SPECIFIC" && parsedStudentIds.length > 0) {
      recipientScholars = await ScholarProfile.find({
        studentId: { $in: parsedStudentIds },
      });
    } else {
      recipientScholars = await ScholarProfile.find({
        studentId: { $ne: facultyId },
      });
    }

    const expandedTargetIds = new Set();
    if (targetType === "SPECIFIC" && parsedStudentIds.length > 0) {
      parsedStudentIds.forEach((id) => expandedTargetIds.add(String(id)));
      recipientScholars.forEach((sc) => {
        expandedTargetIds.add(String(sc.studentId));
        if (sc.studentEmail)
          expandedTargetIds.add(String(sc.studentEmail).toLowerCase());
      });
    } else {
      recipientScholars.forEach((sc) => {
        expandedTargetIds.add(String(sc.studentId));
      });
    }

    const finalTargetIds = Array.from(expandedTargetIds);

    const newAssignment = await ClassroomAssignment.create({
      title: title.trim(),
      description: description.trim(),
      subject: subject.trim() || "General",
      board: "Core Curriculum",
      totalMarks: validMarks,
      dueDate: parsedDue,
      targetType:
        targetType === "SPECIFIC" && parsedStudentIds.length > 0
          ? "SPECIFIC"
          : "ALL",
      assignedStudentIds: finalTargetIds,
      referenceFileUrl,
      referenceFileName,
      referenceFileType,
      facultyId,
      facultyName,
      submissions: [],
      comments: [],
    });

    const notifDocs = recipientScholars.map((sc) => ({
      studentId: sc.studentId,
      type: "classroom-assignment",
      title: `New ${subject} Assignment (${validMarks} Points)`,
      message: `${facultyName} posted "${title.trim()}". Due by ${parsedDue.toLocaleString()}.`,
      isRead: false,
    }));

    if (notifDocs.length > 0) {
      await Notification.insertMany(notifDocs);
    }

    await pushNotification({
      studentId: facultyId,
      type: "assignment-created",
      title: `Assignment Published: "${title.trim()}"`,
      message: `${subject} (${validMarks} Points) assigned to ${recipientScholars.length} student(s).`,
    });

    return res.status(201).json({
      success: true,
      message: `Assignment "${title.trim()}" (${validMarks} Points) assigned to ${
        recipientScholars.length
      } student(s)!`,
      assignment: newAssignment,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const getClassroomAssignments = async (req, res) => {
  try {
    const studentId = getFacultyId(req);
    const studentEmail = String(req.query?.email || "").trim().toLowerCase();
    const studentName = String(req.query?.studentName || "").trim().toLowerCase();
    const role = String(req.query?.role || "student").toLowerCase();

    const allAssignments = await ClassroomAssignment.find({}).sort({
      createdAt: -1,
    });

    if (role === "faculty") {
      return res.status(200).json({
        success: true,
        assignments: allAssignments,
      });
    }

    const orConditions = [{ studentId: String(studentId) }];
    if (studentEmail) {
      orConditions.push({
        studentEmail: new RegExp(`^${studentEmail}$`, "i"),
      });
    }
    if (studentName) {
      orConditions.push({
        studentName: new RegExp(`^${studentName}$`, "i"),
      });
    }
    const matchedProfile = await ScholarProfile.findOne({ $or: orConditions });
    const resolvedDbId = matchedProfile ? String(matchedProfile.studentId) : "";

    const studentAssignments = allAssignments.filter((asgn) => {
      if (asgn.targetType === "ALL") return true;
      const list = (asgn.assignedStudentIds || []).map((id) =>
        String(id).toLowerCase()
      );
      return (
        list.includes(String(studentId).toLowerCase()) ||
        (resolvedDbId && list.includes(resolvedDbId.toLowerCase())) ||
        (studentEmail && list.includes(studentEmail))
      );
    });

    return res.status(200).json({
      success: true,
      assignments: studentAssignments,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const deleteClassroomAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    await ClassroomAssignment.findByIdAndDelete(assignmentId);
    return res.status(200).json({
      success: true,
      message: "Assignment deleted permanently.",
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const submitStudentAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const studentId = getFacultyId(req);
    const {
      studentName = "Student",
      studentEmail = "",
      studentPhone = "",
      studentAvatar = "",
      answerText = "",
      extractedPdfText = "",
    } = req.body;
    const file = req.file;

    const assignment = await ClassroomAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    const nowMs = Date.now();
    const dueMs = new Date(assignment.dueDate).getTime();
    if (nowMs > dueMs) {
      return res.status(403).json({
        success: false,
        message:
          "Deadline Passed! The due date & time for this assignment has expired and submissions are closed.",
      });
    }

    if (!answerText.trim() && !file) {
      return res.status(400).json({
        success: false,
        message:
          "Please attach your Video, Photo, or PDF file (or write a response) before submitting.",
      });
    }

    let fileUrl = "";
    let fileName = "";
    let fileType = "none";

    if (file) {
      fileUrl = getFileDataUri(file);
      fileName = file.originalname || "Student_Submission";
      if (file.mimetype === "application/pdf") fileType = "pdf";
      else if (file.mimetype?.startsWith("image/")) fileType = "image";
      else if (file.mimetype?.startsWith("video/")) fileType = "video";
      else fileType = "file";
    }

    const existingIdx = (assignment.submissions || []).findIndex(
      (s) =>
        String(s.studentId) === String(studentId) ||
        (studentEmail &&
          String(s.studentEmail).toLowerCase() ===
            String(studentEmail).toLowerCase())
    );

    let assignedRank = (assignment.submissions || []).length + 1;

    if (existingIdx >= 0) {
      assignedRank =
        assignment.submissions[existingIdx].submissionRank || existingIdx + 1;
      assignment.submissions[existingIdx].answerText = answerText.trim();
      if (extractedPdfText) {
        assignment.submissions[existingIdx].extractedPdfText = extractedPdfText;
      }
      if (fileUrl) {
        assignment.submissions[existingIdx].fileUrl = fileUrl;
        assignment.submissions[existingIdx].fileName = fileName;
        assignment.submissions[existingIdx].fileType = fileType;
      }
      assignment.submissions[existingIdx].submittedAt = new Date();
    } else {
      assignment.submissions.push({
        studentId,
        studentName,
        studentEmail,
        studentPhone,
        studentAvatar,
        submissionRank: assignedRank,
        submittedAt: new Date(),
        answerText: answerText.trim(),
        extractedPdfText: String(extractedPdfText || "").trim(),
        fileUrl,
        fileName,
        fileType,
        status: "Submitted",
      });
    }

    await assignment.save();

    const xpBonus = assignedRank === 1 ? 60 : assignedRank <= 3 ? 40 : 25;
    await LeaderboardEntry.findOneAndUpdate(
      { studentId },
      { $inc: { totalXp: xpBonus } }
    ).catch(() => {});
    await ScholarProfile.findOneAndUpdate(
      { studentId },
      { $inc: { totalXp: xpBonus } }
    ).catch(() => {});

    await pushNotification({
      studentId: assignment.facultyId,
      type: "assignment-submitted",
      title: `${
        assignedRank === 1 ? "#1 First Submitter" : `Submission #${assignedRank}`
      } — ${studentName}`,
      message: `${studentName} turned in "${assignment.title}" (${assignment.subject}).`,
    });

    return res.status(200).json({
      success: true,
      message:
        assignedRank === 1
          ? `Turned in! You are #1 First to Submit "${assignment.title}" (+60 XP).`
          : `Assignment turned in successfully (Submission #${assignedRank}, +${xpBonus} XP).`,
      submissionRank: assignedRank,
      assignment,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const aiEvaluateSubmission = async (req, res) => {
  try {
    const { assignmentId, submissionId } = req.params;
    const assignment = await ClassroomAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    const sub = assignment.submissions.id(submissionId);
    if (!sub) {
      return res.status(404).json({
        success: false,
        message: "Student submission not found.",
      });
    }

    const maxMarks = Number(assignment.totalMarks) || 100;
    const combinedStudentWork = `${sub.answerText || ""}\n${
      sub.extractedPdfText || ""
    }`.trim();

    let aiMarks = Math.round(maxMarks * 0.85);
    let aiStars = 4;
    let aiFeedback = "";

    const prompt = `You are a university professor grading a student's "${assignment.subject}" assignment.
Assignment Title: "${assignment.title}"
Instructions: "${assignment.description || "Complete all required tasks."}"
Total Points: ${maxMarks}
Student Name: ${sub.studentName} (Submission Order: #${sub.submissionRank})
Attached File: ${sub.fileName || "None"}
Student Work:
"""
${combinedStudentWork.slice(0, 6000) || "(Media/PDF attachment submitted)"}
"""
Return ONLY valid JSON:
{
  "suggestedMarks": 0 to ${maxMarks},
  "suggestedStars": 1 to 5,
  "feedback": "2 concise sentences of constructive evaluation."
}`;

    try {
      const response = await fetch("https://text.pollinations.ai/openai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai",
          seed: Math.floor(Math.random() * 99999),
          temperature: 0.3,
          messages: [
            {
              role: "system",
              content:
                "Return ONLY valid JSON with suggestedMarks, suggestedStars, and feedback.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const raw = data?.choices?.[0]?.message?.content || "";
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.suggestedMarks !== undefined) {
            aiMarks = Math.min(
              maxMarks,
              Math.max(1, Math.round(Number(parsed.suggestedMarks)))
            );
          }
          if (parsed.suggestedStars !== undefined) {
            aiStars = Math.min(
              5,
              Math.max(1, Math.round(Number(parsed.suggestedStars)))
            );
          }
          if (parsed.feedback) {
            aiFeedback = String(parsed.feedback).trim();
          }
        }
      }
    } catch (err) {}

    if (!aiFeedback) {
      const wordCount = combinedStudentWork.split(/\s+/).filter(Boolean).length;
      const hasAttachment = Boolean(sub.fileUrl);
      const ratio =
        wordCount > 120
          ? 0.92
          : wordCount > 50
          ? 0.86
          : hasAttachment
          ? 0.85
          : 0.75;
      aiMarks = Math.round(maxMarks * ratio);
      aiStars = ratio >= 0.88 ? 5 : ratio >= 0.75 ? 4 : 3;
      aiFeedback = `Evaluation (${assignment.subject}): Submission by ${sub.studentName} (#${sub.submissionRank}) addresses the core requirements of "${assignment.title}". Recommended score: ${aiMarks}/${maxMarks}.`;
    }

    sub.aiSuggestedMarks = aiMarks;
    sub.aiSuggestedStars = aiStars;
    sub.aiSuggestedFeedback = aiFeedback;

    await assignment.save();

    return res.status(200).json({
      success: true,
      message: `Auto-Evaluation Complete: Suggested ${aiMarks}/${maxMarks} (${aiStars}/5 Stars).`,
      aiEvaluation: {
        suggestedMarks: aiMarks,
        suggestedStars: aiStars,
        feedback: aiFeedback,
      },
      assignment,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const gradeStudentSubmission = async (req, res) => {
  try {
    const { assignmentId, submissionId } = req.params;
    const {
      obtainedMarks,
      stars = 4,
      feedback = "",
      facultyName = "Faculty",
    } = req.body;

    const assignment = await ClassroomAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    const sub = assignment.submissions.id(submissionId);
    if (!sub) {
      return res.status(404).json({
        success: false,
        message: "Student submission not found.",
      });
    }

    const maxMarks = Number(assignment.totalMarks) || 100;
    const validObtained = Math.min(
      maxMarks,
      Math.max(0, Number(obtainedMarks) || 0)
    );
    const percentage = Math.round((validObtained / maxMarks) * 100);
    const grade =
      percentage >= 90
        ? "A+"
        : percentage >= 75
        ? "A"
        : percentage >= 60
        ? "B"
        : percentage >= 40
        ? "C"
        : "F";
    const validStars = Math.min(5, Math.max(1, Number(stars) || 4));

    sub.obtainedMarks = validObtained;
    sub.percentage = percentage;
    sub.grade = grade;
    sub.stars = validStars;
    sub.feedback =
      feedback.trim() ||
      sub.aiSuggestedFeedback ||
      `Graded by ${facultyName}. Score: ${validObtained}/${maxMarks} (${percentage}%).`;
    sub.status = "Graded";
    sub.gradedAt = new Date();

    await assignment.save();

    const earnedXp = Math.round(percentage * 0.8);
    await LeaderboardEntry.findOneAndUpdate(
      { studentId: sub.studentId },
      { $inc: { totalXp: earnedXp } }
    ).catch(() => {});
    await ScholarProfile.findOneAndUpdate(
      { studentId: sub.studentId },
      { $inc: { totalXp: earnedXp } }
    ).catch(() => {});

    await pushNotification({
      studentId: sub.studentId,
      type: "assignment-graded",
      title: `Classwork Graded: ${validObtained}/${maxMarks} (${percentage}% • Grade ${grade})`,
      message: `${facultyName} returned your ${assignment.subject} assignment "${assignment.title}" with ${validStars}/5 Stars.`,
    });

    return res.status(200).json({
      success: true,
      message: `Grade (${validObtained}/${maxMarks}) returned to ${sub.studentName}.`,
      assignment,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const addAssignmentComment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const {
      senderId = "",
      senderName = "Scholar",
      senderRole = "student",
      studentThreadId = "PUBLIC",
      text = "",
    } = req.body;

    if (!text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Comment text cannot be empty.",
      });
    }

    const assignment = await ClassroomAssignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found.",
      });
    }

    assignment.comments.push({
      senderId: senderId || getFacultyId(req),
      senderName,
      senderRole,
      studentThreadId: studentThreadId || "PUBLIC",
      text: text.trim(),
      createdAt: new Date(),
    });

    await assignment.save();

    if (senderRole === "student") {
      await pushNotification({
        studentId: assignment.facultyId,
        type: "assignment-comment",
        title: `Comment on "${assignment.title}"`,
        message: `${senderName}: "${text.trim().slice(0, 80)}"`,
      });
    }

    return res.status(201).json({
      success: true,
      assignment,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============================================================================
// 4. BROADCAST OFFICIAL CAMPUS NOTICE
// ============================================================================
export const broadcastFacultyNotice = async (req, res) => {
  try {
    const facultyId = getFacultyId(req);
    const {
      facultyName = "Faculty",
      targetStudentId = "ALL",
      noticeType = "announcement",
      title = "",
      message = "",
    } = req.body;

    if (!title.trim() || !message.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please provide both an announcement title and message.",
      });
    }

    const formattedTitle = `[${facultyName}] ${title.trim()}`;

    if (targetStudentId === "ALL") {
      const allScholars = await ScholarProfile.find({
        studentId: { $ne: facultyId },
      });

      const notifDocs = allScholars.map((s) => ({
        studentId: s.studentId,
        type: noticeType,
        title: formattedTitle,
        message: message.trim(),
        isRead: false,
      }));

      if (notifDocs.length > 0) {
        await Notification.insertMany(notifDocs);
      }

      return res.status(201).json({
        success: true,
        message: `Announcement broadcasted to ${allScholars.length} registered student(s).`,
      });
    } else {
      await pushNotification({
        studentId: targetStudentId,
        type: noticeType,
        title: formattedTitle,
        message: message.trim(),
      });

      return res.status(201).json({
        success: true,
        message: "Direct academic alert sent to student.",
      });
    }
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const assignFacultyAssessment = async (req, res) => {
  return res.status(200).json({ success: true });
};

// ============================================================================
// 5. UPDATE FACULTY PROFILE
// ============================================================================
export const updateFacultyProfile = async (req, res) => {
  try {
    const facultyId = getFacultyId(req);
    const { StudentName, StudentEmail, Phone, ProfileImage } = req.body;

    if (mongoose.connection && mongoose.connection.db) {
      const collections = await mongoose.connection.db.listCollections().toArray();
      const userCols = collections.filter(
        (c) =>
          /student|user|auth|register|account|faculty/i.test(c.name) &&
          !/aichats|studytasks|quizzes|notebooks|notifications|friendrequests|directmessages|leaderboardentries|scholarprofiles|studycommunities|classroomassignments/i.test(
            c.name
          )
      );

      for (const col of userCols) {
        const updateFields = {};
        if (StudentName) updateFields.StudentName = StudentName;
        if (StudentEmail) updateFields.StudentEmail = StudentEmail;
        if (Phone !== undefined) updateFields.Phone = Phone;
        if (ProfileImage !== undefined) updateFields.ProfileImage = ProfileImage;

        if (Object.keys(updateFields).length > 0) {
          const query = mongoose.Types.ObjectId.isValid(facultyId)
            ? { _id: new mongoose.Types.ObjectId(facultyId) }
            : { StudentEmail: StudentEmail || facultyId };

          await mongoose.connection.db
            .collection(col.name)
            .updateOne(query, { $set: updateFields })
            .catch(() => {});
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Faculty profile updated successfully!",
      user: {
        StudentName,
        StudentEmail,
        Phone,
        ProfileImage,
        role: "faculty",
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============================================================================
// 6. COMMUNITY ROUTE HANDLERS
// ============================================================================
export const createCommunity = async (req, res) => {
  try {
    const studentId = getFacultyId(req);
    const {
      name = "",
      communityName = "",
      subject = "General Study",
      communitySubject = "General Study",
      description = "",
      communityDescription = "",
    } = req.body;

    const finalName = (name || communityName).trim();
    if (!finalName) {
      return res.status(400).json({
        success: false,
        message: "Please enter a Community Name.",
      });
    }

    const senderProfile = await ScholarProfile.findOne({ studentId });
    const finalSenderName =
      senderProfile?.studentName || getFacultyName(req) || "Faculty";
    const finalSenderAvatar = senderProfile?.avatar || "";
    const finalSenderTier = senderProfile?.tier || "Diamond";

    const newCommId = `community_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const createdComm = await StudyCommunity.create({
      communityId: newCommId,
      name: finalName,
      subject: (subject || communitySubject).trim() || "General Study",
      description:
        (description || communityDescription).trim() ||
        `Study community created by ${finalSenderName}.`,
      creatorId: studentId,
      creatorName: finalSenderName,
      members: [
        {
          studentId,
          studentName: finalSenderName,
          avatar: finalSenderAvatar,
          tier: finalSenderTier,
        },
      ],
    });

    await DirectMessage.create({
      senderId: studentId,
      senderName: finalSenderName,
      senderAvatar: finalSenderAvatar,
      receiverId: newCommId,
      receiverName: createdComm.name,
      text: `Welcome to "${createdComm.name}" (${createdComm.subject})!`,
      messageType: "text",
    });

    return res.status(201).json({
      success: true,
      message: `Community "${createdComm.name}" created successfully!`,
      community: {
        ...createdComm.toObject(),
        isCommunity: true,
        studentId: createdComm.communityId,
        studentName: createdComm.name,
        isMember: true,
        membersCount: 1,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const joinCommunity = async (req, res) => {
  try {
    const studentId = getFacultyId(req);
    const communityId = req.params?.communityId || req.body?.communityId;

    const comm = await StudyCommunity.findOne({ communityId });
    if (!comm) {
      return res.status(404).json({
        success: false,
        message: "Community not found.",
      });
    }

    const senderProfile = await ScholarProfile.findOne({ studentId });
    const finalSenderName =
      senderProfile?.studentName || getFacultyName(req) || "Scholar";
    const finalSenderAvatar = senderProfile?.avatar || "";
    const finalSenderTier = senderProfile?.tier || "Bronze";

    const alreadyIn = (comm.members || []).some(
      (m) => String(m.studentId) === String(studentId)
    );
    if (!alreadyIn) {
      comm.members.push({
        studentId,
        studentName: finalSenderName,
        avatar: finalSenderAvatar,
        tier: finalSenderTier,
      });
      await comm.save();
    }

    return res.status(200).json({
      success: true,
      message: `You joined "${comm.name}"!`,
      community: {
        ...comm.toObject(),
        isCommunity: true,
        studentId: comm.communityId,
        studentName: comm.name,
        isMember: true,
        membersCount: comm.members.length,
      },
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const getCommunityMessages = async (req, res) => {
  req.params.friendId = req.params.communityId;
  return getDirectMessages(req, res);
};

export const sendCommunityMessage = async (req, res) => {
  req.body.receiverId = req.params.communityId || req.body.receiverId;
  return sendDirectMessage(req, res);
};

export const editCommunityMessage = async (req, res) => {
  return editDirectMessage(req, res);
};

export const deleteCommunityMessage = async (req, res) => {
  return deleteDirectMessage(req, res);
};