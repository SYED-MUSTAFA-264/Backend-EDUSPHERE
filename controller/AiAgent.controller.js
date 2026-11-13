// Backend/controller/AiAgent.controller.js
import "dotenv/config";
import fs from "fs";
import zlib from "zlib";
import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";
import {
  Quiz,
  StudyTask,
  AiChat,
  NoteBook,
  Notification,
  LeaderboardEntry,
  ScholarProfile,
  FriendRequest,
  DirectMessage,
} from "../model/AiAgent.model.js";

const studyCommunitySchema = new mongoose.Schema(
  {
    communityId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    subject: { type: String, default: "General Study" },
    description: { type: String, default: "" },
    avatar: { type: String, default: "" },
    creatorId: { type: String, required: true },
    creatorName: { type: String, default: "Scholar" },
    members: [
      {
        studentId: { type: String, required: true },
        studentName: { type: String, default: "Scholar" },
        avatar: { type: String, default: "" },
        tier: { type: String, default: "Bronze" },
        joinedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

export const StudyCommunity =
  mongoose.models.StudyCommunity ||
  mongoose.model("StudyCommunity", studyCommunitySchema);

console.log(
  "🚀 AI AGENT + 3D MESSENGER (POLLS, EVENTS, FACULTY DIRECT & COMMUNITY INVITES) LOADED!"
);

const DUMMY_IDS_TO_PURGE = [
  "scholar_ayesha_01",
  "scholar_hamza_02",
  "scholar_zainab_03",
  "scholar_bilal_04",
  "scholar_usman_05",
  "default_student",
  "faculty_user",
  "faculty_professor_01",
];

const DUMMY_NAMES_TO_PURGE = [
  "Ayesha Siddiqui",
  "Hamza Tariq",
  "Zainab Raza",
  "Bilal Ahmed",
  "Usman Farooq",
  "You (Current Scholar)",
  "Scholar",
  "Default Student",
];

const getCleanApiKey = () => {
  const rawKey = (process.env.GEMINI_API_KEY || "")
    .trim()
    .replace(/^["']|["']$/g, "");
  if (
    !rawKey ||
    rawKey.includes("YAHAN_APNI") ||
    rawKey.includes("apni_gemini") ||
    !rawKey.startsWith("AIza") ||
    rawKey.length < 30
  ) {
    return null;
  }
  return rawKey;
};

const getAiClient = () => {
  try {
    const validKey = getCleanApiKey();
    return validKey ? new GoogleGenAI({ apiKey: validKey }) : null;
  } catch (err) {
    return null;
  }
};

const getStudentId = (req) =>
  req.query?.studentId ||
  req.body?.studentId ||
  req.body?.fromStudentId ||
  req.body?.senderId ||
  req.user?.id ||
  req.user?._id ||
  req.user?.StudentEmail ||
  req.user?.email ||
  "default_student";

const getStudentNameFromReq = (req) =>
  req.query?.studentName ||
  req.body?.studentName ||
  req.body?.fromName ||
  req.body?.senderName ||
  req.user?.StudentName ||
  req.user?.name ||
  "Scholar";

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
// SYNC REAL REGISTERED STUDENTS & FACULTY (FACULTY EXCLUDED FROM LEADERBOARD,
// INCLUDED IN CHAT DIRECTORY FOR INSTANT NO-REQUEST MESSAGING)
// ============================================================================
const ensureSeededLeaderboard = async () => {
  try {
    await LeaderboardEntry.deleteMany({
      $or: [
        { studentId: { $in: DUMMY_IDS_TO_PURGE } },
        { studentName: { $in: DUMMY_NAMES_TO_PURGE } },
        { email: /@edusphere\.edu$/i },
      ],
    });
    await ScholarProfile.deleteMany({
      $or: [
        { studentId: { $in: DUMMY_IDS_TO_PURGE } },
        { studentName: { $in: DUMMY_NAMES_TO_PURGE } },
        { studentEmail: /@edusphere\.edu$/i },
      ],
    });
    await StudyCommunity.deleteMany({
      communityId: {
        $in: ["community_cs_web_hub", "community_physics_math_lab"],
      },
    });
  } catch (e) {}
};

const syncAllRegisteredStudentsFromDb = async () => {
  const facultyIdsSet = new Set();
  try {
    await ensureSeededLeaderboard();
    if (!mongoose.connection || !mongoose.connection.db) return facultyIdsSet;

    const collections = await mongoose.connection.db.listCollections().toArray();
    const userCols = collections.filter(
      (c) =>
        /student|user|auth|register|account|member|faculty/i.test(c.name) &&
        !/aichats|studytasks|quizzes|notebooks|notifications|friendrequests|directmessages|leaderboardentries|scholarprofiles|studycommunities|classroomassignments/i.test(
          c.name
        )
    );

    const validProfileIds = new Set();
    const validLeaderboardIds = new Set();
    const seenEmails = new Set();

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
        if (DUMMY_NAMES_TO_PURGE.includes(stName)) continue;
        if (/@edusphere\.edu$/i.test(stEmail)) continue;

        const stId = String(doc._id || stEmail);
        if (seenEmails.has(stEmail)) continue;
        seenEmails.add(stEmail);

        if (docRole === "admin") {
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

        // FACULTY: Keep out of student Leaderboard, but sync into ScholarProfile with tier="Faculty"
        // so students and faculty can message each other directly without friend requests!
        if (docRole === "faculty") {
          facultyIdsSet.add(stId);
          facultyIdsSet.add(stEmail);
          validProfileIds.add(stId);

          await LeaderboardEntry.deleteMany({
            $or: [{ studentId: stId }, { studentId: stEmail }, { email: stEmail }],
          });
          if (stId !== stEmail) {
            await ScholarProfile.deleteMany({ studentId: stEmail });
          }

          await ScholarProfile.findOneAndUpdate(
            { studentId: stId },
            {
              studentId: stId,
              studentName: stName,
              studentEmail: stEmail,
              phone: stPhone,
              cleanPhone: normalizePhoneDigits(stPhone),
              avatar: stAvatar,
              tier: "Faculty",
              totalXp: 1000,
              level: 10,
              avgAccuracy: 100,
            },
            { upsert: true, new: true }
          );
          continue;
        }

        validProfileIds.add(stId);
        validLeaderboardIds.add(stId);

        if (stId !== stEmail) {
          await LeaderboardEntry.deleteMany({ studentId: stEmail });
          await ScholarProfile.deleteMany({ studentId: stEmail });
        }

        const existingLb = await LeaderboardEntry.findOne({ studentId: stId });
        const xp = existingLb?.totalXp || 100;
        const acc = existingLb?.avgAccuracy || 0;
        const lvl = existingLb?.level || Math.floor(xp / 150) + 1;
        const tier = computeTierBadge(xp, acc);

        await LeaderboardEntry.findOneAndUpdate(
          { studentId: stId },
          {
            studentId: stId,
            studentName: stName,
            phone: stPhone,
            email: stEmail,
            avatar: stAvatar,
            totalXp: xp,
            level: lvl,
            avgAccuracy: acc,
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
            totalXp: xp,
            level: lvl,
            avgAccuracy: acc,
          },
          { upsert: true, new: true }
        );
      }
    }

    await LeaderboardEntry.deleteMany({
      studentId: { $nin: Array.from(validLeaderboardIds) },
    });
    await ScholarProfile.deleteMany({
      studentId: { $nin: Array.from(validProfileIds) },
    });
  } catch (e) {}
  return facultyIdsSet;
};

const getFileBuffer = (file) => {
  if (!file) return null;
  if (file.buffer) return file.buffer;
  if (file.path && fs.existsSync(file.path)) return fs.readFileSync(file.path);
  return null;
};

const getFileBase64 = (file) => {
  const buf = getFileBuffer(file);
  return buf ? buf.toString("base64") : "";
};

const shuffleArray = (arr) => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const randomizeQuestionOptions = (q) => {
  if (!q || !Array.isArray(q.options) || q.options.length < 2) return q;
  const cleanOptions = q.options.slice(0, 4).map((opt) =>
    String(opt)
      .replace(/^[(\[]?[A-Da-d1-4][)\].:-]\s*/, "")
      .trim()
  );
  while (cleanOptions.length < 4) {
    cleanOptions.push(`None of the above`);
  }
  const validIdx =
    Number(q.correctOptionIndex) >= 0 &&
    Number(q.correctOptionIndex) < cleanOptions.length
      ? Number(q.correctOptionIndex)
      : 0;
  const correctText = cleanOptions[validIdx];
  const shuffledOptions = shuffleArray(cleanOptions);
  const newCorrectIdx = shuffledOptions.indexOf(correctText);

  return {
    questionText: String(q.questionText)
      .replace(/^(Q\d+|Question\s*\d+|\d+)[).:-]\s*/i, "")
      .trim(),
    options: shuffledOptions,
    correctOptionIndex: newCorrectIdx >= 0 ? newCorrectIdx : 0,
    explanation: String(
      q.explanation || `The correct answer is "${correctText}".`
    ).trim(),
    topicTag: String(q.topicTag || "Core Concept").trim(),
  };
};

const extractTextFromPdfBuffer = (buffer) => {
  if (!buffer) return "";
  try {
    const rawLatin = buffer.toString("latin1");
    let extractedChunks = [];

    const extractLiteralStrings = (str) => {
      const regex = /\(([^()\\]{2,250})\)/g;
      let m;
      while ((m = regex.exec(str)) !== null) {
        const clean = m[1]
          .replace(/\\n/g, " ")
          .replace(/\\r/g, " ")
          .replace(/[^\x20-\x7E]/g, " ")
          .trim();
        if (clean.length > 2 && /[a-zA-Z]{2,}/.test(clean)) {
          extractedChunks.push(clean);
        }
      }
    };

    const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
    let streamMatch;
    while ((streamMatch = streamRegex.exec(rawLatin)) !== null) {
      try {
        const streamBuf = Buffer.from(streamMatch[1], "latin1");
        const inflated = zlib.inflateSync(streamBuf).toString("latin1");
        extractLiteralStrings(inflated);
      } catch (e) {}
    }

    extractLiteralStrings(rawLatin);
    const combined = extractedChunks.join(" ").replace(/\s+/g, " ").trim();
    return combined.length > 25 ? combined.slice(0, 18000) : "";
  } catch (err) {
    return "";
  }
};

const parseQuestionsDirectlyFromPdfText = (
  pdfText = "",
  topicName = "Document"
) => {
  if (!pdfText || pdfText.trim().length < 40) return [];
  const extractedQuestions = [];
  const cleanTopic =
    topicName.replace(/\.[^/.]+$/, "").trim() || "Uploaded PDF";

  const normalized = pdfText.replace(/\r/g, "\n");
  const mcqBlockRegex =
    /(?:^|\s)(?:Q\.?\s*\d+|\d+[.)])\s*([^?]+\?)\s*(?:[([]?[Aa][)\].:-]\s*)(.+?)\s+(?:[([]?[Bb][)\].:-]\s*)(.+?)\s+(?:[([]?[Cc][)\].:-]\s*)(.+?)\s+(?:[([]?[Dd][)\].:-]\s*)([^\n?]+?)(?=(?:\s+(?:Q\.?\s*\d+|\d+[.)])\s*|$))/g;

  let match;
  while ((match = mcqBlockRegex.exec(normalized)) !== null) {
    const qText = match[1]?.trim();
    const optA = match[2]?.trim();
    const optB = match[3]?.trim();
    const optC = match[4]?.trim();
    const optD = match[5]
      ?.replace(/\b(Answer|Ans|Correct|Explanation)[:\s].*$/i, "")
      .trim();

    let correctIdx = 0;
    const ansMatch = match[0].match(
      /\b(?:Answer|Ans|Correct)\s*[:=-]?\s*[([]?([A-Da-d])[)\]]?/i
    );
    if (ansMatch) {
      correctIdx = "abcd".indexOf(ansMatch[1].toLowerCase());
      if (correctIdx < 0) correctIdx = 0;
    }

    if (qText && optA && optB && optC && optD) {
      extractedQuestions.push(
        randomizeQuestionOptions({
          questionText: qText,
          options: [optA, optB, optC, optD],
          correctOptionIndex: correctIdx,
          explanation: `Extracted directly from your uploaded document (${cleanTopic}).`,
          topicTag: `${cleanTopic} • PDF MCQ`,
        })
      );
    }
  }

  const rawSentences = pdfText
    .split(/(?<=[.?!])\s+|\n+/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter(
      (s) =>
        s.length >= 35 &&
        s.length <= 190 &&
        /[a-zA-Z]{4,}/.test(s) &&
        !/^(page|chapter|copyright|all rights|table of contents)/i.test(s)
    );

  const defItems = [];
  const generalFacts = [];

  for (const sent of rawSentences) {
    const defMatch = sent.match(
      /^([A-Z][A-Za-z0-9\s\-_/+()#]{2,42}?)\s+(?:is|are|refers to|means|represents|defines|used to|stands for|provides)\s+(.{20,145})$/
    );
    if (defMatch) {
      defItems.push({
        term: defMatch[1].trim(),
        definition: defMatch[2].replace(/[.;]$/, "").trim(),
        fullSentence: sent,
      });
    } else {
      generalFacts.push(sent.replace(/[.;]$/, "").trim());
    }
  }

  const allDefsPool = defItems.map((d) => d.definition);
  defItems.forEach((item, idx) => {
    const otherDefs = shuffleArray(
      allDefsPool.filter((d) => d !== item.definition)
    ).slice(0, 3);
    while (otherDefs.length < 3) {
      const extraFact =
        generalFacts[(idx + otherDefs.length) % (generalFacts.length || 1)];
      otherDefs.push(
        extraFact
          ? extraFact.slice(0, 95)
          : `An unrelated external configuration not used in ${item.term}`
      );
    }

    extractedQuestions.push(
      randomizeQuestionOptions({
        questionText: `According to the uploaded ${cleanTopic} notes, what is the role or definition of "${item.term}"?`,
        options: [item.definition, ...otherDefs.slice(0, 3)],
        correctOptionIndex: 0,
        explanation: `From your PDF: "${item.fullSentence}"`,
        topicTag: `${cleanTopic} • PDF Concept`,
      })
    );
  });

  return shuffleArray(extractedQuestions);
};

const getSubjectSpecificQuestionBank = (topicName = "") => {
  const t = topicName.toLowerCase();
  if (
    /\b(phy|physics|mechanics|newton|force|motion|kinematics|thermodynamics|optics|electromagnetism|quantum|gravity|wave|energy|momentum|voltage|current|ohm)\b/i.test(
      t
    )
  ) {
    return [
      {
        questionText:
          "According to Newton's Second Law of Motion, how is net force (F) mathematically related to mass (m) and acceleration (a)?",
        options: ["F = m × a", "F = m / a", "F = ½ m v²", "F = m × g × h"],
        correctOptionIndex: 0,
        explanation:
          "Newton's Second Law states that net force equals mass multiplied by acceleration (F = ma).",
        topicTag: "Physics • Mechanics",
      },
      {
        questionText: "What is the SI unit of electrical resistance in Ohm's Law?",
        options: ["Ohm (Ω)", "Farad (F)", "Tesla (T)", "Henry (H)"],
        correctOptionIndex: 0,
        explanation: "Electrical resistance (R = V/I) is measured in Ohms (Ω).",
        topicTag: "Physics • Electricity",
      },
      {
        questionText:
          "If the velocity of a moving object is doubled, by what factor does its kinetic energy increase?",
        options: [
          "It quadruples (4 times)",
          "It doubles (2 times)",
          "It remains unchanged",
          "It decreases by half",
        ],
        correctOptionIndex: 0,
        explanation:
          "Since Kinetic Energy KE = ½mv², doubling v increases KE by 2² = 4 times.",
        topicTag: "Physics • Work & Energy",
      },
      {
        questionText: "What is the approximate speed of light in a vacuum?",
        options: [
          "3.0 × 10⁸ m/s",
          "3.0 × 10⁵ m/s",
          "9.8 m/s²",
          "1.6 × 10⁻¹⁹ m/s",
        ],
        correctOptionIndex: 0,
        explanation:
          "Light travels in a vacuum at approximately c = 3.0 × 10⁸ meters per second.",
        topicTag: "Physics • Optics & Waves",
      },
    ];
  }

  if (
    /\b(math|mathematics|calculus|algebra|trigonometry|geometry|matrix|matrices|derivative|integration|integral|probability|statistics|equation)\b/i.test(
      t
    )
  ) {
    return [
      {
        questionText:
          "What is the derivative of f(x) = x³ + 4x² - 7x + 12 with respect to x?",
        options: ["3x² + 8x - 7", "3x² + 4x - 7", "x⁴/4 + 4x³ - 7", "6x + 8"],
        correctOptionIndex: 0,
        explanation:
          "Using the power rule d/dx(xⁿ) = nxⁿ⁻¹: d/dx(x³ + 4x² - 7x + 12) = 3x² + 8x - 7.",
        topicTag: "Mathematics • Differential Calculus",
      },
      {
        questionText:
          "What are the roots of the quadratic equation x² - 5x + 6 = 0?",
        options: [
          "x = 2 and x = 3",
          "x = -2 and x = -3",
          "x = 1 and x = 6",
          "x = -1 and x = 6",
        ],
        correctOptionIndex: 0,
        explanation:
          "Factoring x² - 5x + 6 = (x - 2)(x - 3) = 0 gives x = 2 and x = 3.",
        topicTag: "Mathematics • Algebra",
      },
      {
        questionText:
          "In trigonometry, what is the fundamental Pythagorean identity for any angle θ?",
        options: [
          "sin²(θ) + cos²(θ) = 1",
          "sin(θ) - cos(θ) = 1",
          "tan²(θ) + cos²(θ) = 0",
          "sin(2θ) = sin(θ) + cos(θ)",
        ],
        correctOptionIndex: 0,
        explanation:
          "By the unit circle and Pythagoras theorem, sin²(θ) + cos²(θ) = 1.",
        topicTag: "Mathematics • Trigonometry",
      },
    ];
  }

  return [
    {
      questionText:
        "What is the time complexity of searching for an element in a sorted array using Binary Search?",
      options: ["O(log n)", "O(n)", "O(n²)", "O(1)"],
      correctOptionIndex: 0,
      explanation:
        "Binary Search halves the search space on each comparison, achieving O(log n) logarithmic time complexity.",
      topicTag: "Computer Science • Algorithms",
    },
    {
      questionText:
        "Which data structure operates strictly on the LIFO (Last-In, First-Out) principle?",
      options: ["Stack", "Queue", "Binary Search Tree", "Hash Table"],
      correctOptionIndex: 0,
      explanation:
        "A Stack inserts (push) and removes (pop) elements from the top, following Last-In, First-Out (LIFO).",
      topicTag: "Computer Science • Data Structures",
    },
    {
      questionText:
        "In React.js, what is the primary purpose of the Virtual DOM?",
      options: [
        "To compute the minimal diff in memory and update only changed nodes in the real browser DOM",
        "To store relational SQL tables inside localStorage",
        "To compile Python scripts directly in the browser",
        "To disable component state updates",
      ],
      correctOptionIndex: 0,
      explanation:
        "React uses Virtual DOM reconciliation to batch and minimize expensive direct DOM manipulations.",
      topicTag: "Computer Science • React & Web",
    },
  ];
};

const isRomanUrduOrUrduQuery = (text = "") => {
  if (/[\u0600-\u06FF]/.test(text)) return true;
  const romanUrduTokens =
    /\b(kya|kia|kaise|kese|kyun|kahan|kab|kon|kaun|mujhe|mujh|mera|meri|mere|apna|apni|tum|aap|hai|hain|tha|thi|ho|hota|hoti|kr|kar|karo|kren|karein|batao|bata|btao|samjhao|samjha|likh|likho|bana|banao|de|do|dedo|chahiye|chaiye|sawal|jawab|iske|iska|iski|uske|uska|mein|main|se|ko|par|pe|bhi|aur|ya|nahi|nhi|acha|theek|sahi|galat|wale|wala|wali|bare|baare|tarika|tareeqa|matlab|fayde|faide|nuqsan)\b/i;
  return romanUrduTokens.test(text);
};

const buildSmartSubjectResponse = ({
  userPrompt,
  fileName,
  pdfText,
  isRomanUrdu,
}) => {
  const cleanTopic =
    userPrompt
      .replace(
        /\b(explain|what is|define|tell me about|create pdf|generate image|kya hai|samjhao|batao|ke bare mein|pdf banao|image banao)\b/gi,
        ""
      )
      .trim() ||
    fileName?.replace(/\.[^/.]+$/, "") ||
    "Academic Topic";

  if (pdfText && pdfText.length > 40) {
    const sentences = pdfText
      .split(/[.?!]\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 35 && s.length < 220)
      .slice(0, 8);

    return `## Comprehensive Document Analysis: ${fileName || cleanTopic}\n\n### 1. Executive Summary\nBased on your uploaded document **"${
      fileName || cleanTopic
    }"**, here is the structured breakdown addressing your query: *"${userPrompt}"*.\n\n### 2. Key Extracted Concepts\n${sentences
      .map((s) => `* ${s}.`)
      .join("\n")}`;
  }

  if (isRomanUrdu) {
    return `## Complete Guide: ${cleanTopic}\n\n### 1. Bunyadi Tareef (Introduction)\n**${cleanTopic}** ek ahem academic aur technical concept hai. Iska istemal complex problems ko systematic tareeqe se solve karne ke liye hota hai.\n\n### 2. Key Points\n* **Core Principle:** Sabse pehle iske bunyadi rules aur structure ko define kiya jata hai.\n* **Practical Implementation:** Formulas ya code syntax ko step-by-step apply karke accurate output hasil kiya jata hai.`;
  }

  return `## Comprehensive Academic Guide: ${cleanTopic}\n\n### 1. Core Concept & Definition\n**${cleanTopic}** is a foundational methodology used to design, analyze, and solve structured domain problems with high accuracy.\n\n### 2. Key Mechanisms\n* **Foundational Architecture:** Establishes the core variables, governing rules, and structural constraints.\n* **Systematic Execution:** Processes inputs through well-defined logical stages to produce deterministic outputs.`;
};

const callLiveAiEngine = async ({
  systemPrompt,
  userPrompt,
  file,
  base64Data,
  pdfText,
  isRomanUrdu,
}) => {
  const fullContextPrompt = pdfText
    ? `Uploaded Document Name: "${file?.originalname || "Document.pdf"}"\nExtracted Content:\n"""\n${pdfText.slice(
        0,
        8000
      )}\n"""\n\nStudent Question: ${userPrompt}`
    : userPrompt;

  const ai = getAiClient();
  if (ai) {
    try {
      const contents = [];
      if (file && base64Data) {
        contents.push({
          inlineData: { mimeType: file.mimetype, data: base64Data },
        });
      }
      contents.push({ text: fullContextPrompt });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: { systemInstruction: systemPrompt },
      });
      if (response.text && response.text.trim().length > 15) {
        return response.text.trim();
      }
    } catch (e) {}
  }

  try {
    const res = await fetch("https://text.pollinations.ai/openai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai",
        seed: Math.floor(Math.random() * 999999),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: fullContextPrompt },
        ],
        temperature: 0.35,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const reply = data?.choices?.[0]?.message?.content;
      if (reply && reply.trim().length > 15) return reply.trim();
    }
  } catch (e) {}

  return buildSmartSubjectResponse({
    userPrompt,
    fileName: file?.originalname || "",
    pdfText,
    isRomanUrdu,
  });
};

// ============================================================================
// 1. AI MULTIMODAL TUTOR
// ============================================================================
export const askAiTutor = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const {
      message = "",
      mode = "auto",
      extractedPdfText = "",
      voiceLang = "",
    } = req.body;
    const file = req.file;

    if (!message.trim() && !file && !extractedPdfText.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter a question or attach a PDF/Image.",
      });
    }

    let userUploadType = "none";
    let userUploadName = "";
    let userUploadPreview = "";
    let base64Data = "";
    let pdfText = extractedPdfText ? String(extractedPdfText).trim() : "";

    if (file) {
      base64Data = getFileBase64(file);
      userUploadName = file.originalname;
      if (file.mimetype === "application/pdf") {
        userUploadType = "pdf";
        if (!pdfText) {
          pdfText = extractTextFromPdfBuffer(getFileBuffer(file));
        }
      } else if (file.mimetype.startsWith("image/")) {
        userUploadType = "image";
        userUploadPreview = `data:${file.mimetype};base64,${base64Data}`;
      }
    }

    const userPrompt =
      message.trim() ||
      (userUploadType === "image"
        ? "Analyze this image thoroughly and explain everything step by step."
        : `Analyze this uploaded PDF document ("${userUploadName}") thoroughly.`);

    const lowerPrompt = userPrompt.toLowerCase();
    const isRomanUrdu =
      voiceLang === "ur-PK" || isRomanUrduOrUrduQuery(userPrompt);

    const wantsImage =
      mode === "image" ||
      /\b(generate image|create image|make image|draw|diagram|illustration|picture|photo|image bana|tasveer)\b/i.test(
        lowerPrompt
      );

    const wantsPdf =
      mode === "pdf" ||
      /\b(create pdf|generate pdf|make pdf|pdf bana|pdf notes|download pdf|export pdf)\b/i.test(
        lowerPrompt
      );

    const systemInstruction = `You are an elite University Professor and Software Engineer. Reply in ${
      isRomanUrdu ? "Roman Urdu" : "clear professional English"
    } using Markdown headings and bullet points.`;

    const aiReply = await callLiveAiEngine({
      systemPrompt: systemInstruction,
      userPrompt,
      file,
      base64Data,
      pdfText,
      isRomanUrdu,
    });

    let assistantAttachmentType = "none";
    let assistantAttachmentName = "";
    let assistantAttachmentPreview = "";

    if (wantsImage) {
      const cleanImageSubject =
        userPrompt
          .replace(
            /\b(generate|create|make|draw|show|me|an|a|image|diagram|picture|photo|of|for|about|on)\b/gi,
            " "
          )
          .replace(/\s+/g, " ")
          .trim() || "Educational Concept Diagram";

      const seed = Math.floor(Math.random() * 999999);
      assistantAttachmentType = "generated-image";
      assistantAttachmentName = cleanImageSubject.slice(0, 40);
      assistantAttachmentPreview = `https://image.pollinations.ai/prompt/${encodeURIComponent(
        `educational textbook vector diagram of ${cleanImageSubject}`
      )}?width=1024&height=640&seed=${seed}&nologo=true&model=flux`;
    } else if (wantsPdf) {
      assistantAttachmentType = "generated-pdf";
      assistantAttachmentName = `Study_Notes.pdf`;
    }

    let chatDoc = await AiChat.findOne({ studentId });
    if (!chatDoc) chatDoc = new AiChat({ studentId, messages: [] });

    chatDoc.messages.push({
      role: "user",
      text: userPrompt,
      attachmentType: userUploadType,
      attachmentName: userUploadName,
      attachmentPreview: userUploadPreview,
    });

    chatDoc.messages.push({
      role: "assistant",
      text: aiReply,
      attachmentType: assistantAttachmentType,
      attachmentName: assistantAttachmentName,
      attachmentPreview: assistantAttachmentPreview,
    });

    await chatDoc.save();

    return res.status(200).json({
      success: true,
      reply: aiReply,
      isRomanUrdu,
      attachmentType: assistantAttachmentType,
      attachmentName: assistantAttachmentName,
      attachmentPreview: assistantAttachmentPreview,
      messages: chatDoc.messages,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 2. QUIZ & AI ORAL TEST GENERATOR
// ============================================================================
const generateDynamicFallbackQuestions = (
  topicName,
  pdfText,
  difficulty,
  targetCount = 20,
  excludeTexts = new Set()
) => {
  const t = topicName.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " ").trim();
  const seenTexts = new Set(excludeTexts);
  const uniqueQuestions = [];

  const addUnique = (qObj) => {
    if (!qObj || !qObj.questionText) return;
    const normQ = qObj.questionText.trim();
    if (!seenTexts.has(normQ)) {
      seenTexts.add(normQ);
      uniqueQuestions.push(randomizeQuestionOptions(qObj));
    }
  };

  if (pdfText && pdfText.trim().length > 40) {
    const pdfExtracted = parseQuestionsDirectlyFromPdfText(pdfText, t);
    for (const pq of pdfExtracted) {
      addUnique(pq);
      if (uniqueQuestions.length >= targetCount)
        return uniqueQuestions.slice(0, targetCount);
    }
  }

  const subjectBank = shuffleArray(getSubjectSpecificQuestionBank(t));
  for (const sq of subjectBank) {
    addUnique(sq);
    if (uniqueQuestions.length >= targetCount)
      return uniqueQuestions.slice(0, targetCount);
  }

  while (uniqueQuestions.length < targetCount) {
    const idx = uniqueQuestions.length + 1;
    addUnique({
      questionText: `[Concept #${idx}] Which principle is essential when analyzing or implementing ${t}?`,
      options: [
        `Systematic verification of core ${t} rules, parameters, and boundary constraints`,
        `Bypassing all validation and structural checks`,
        `Using unverified random approximations`,
        `Disabling modular error handling`,
      ],
      correctOptionIndex: 0,
      explanation: `${t} requires systematic verification of parameters and boundary conditions.`,
      topicTag: `${t} • Core Principle`,
    });
  }

  return uniqueQuestions.slice(0, targetCount);
};

const buildFreshQuestionsForTopic = async ({
  cleanTopic,
  difficulty = "Medium",
  pdfText = "",
  targetCount = 20,
  excludeTexts = new Set(),
}) => {
  const randomSeed = Math.floor(Math.random() * 1000000);
  const fallbackList = generateDynamicFallbackQuestions(
    cleanTopic,
    pdfText,
    difficulty,
    targetCount,
    excludeTexts
  );
  return {
    questions: fallbackList.slice(0, targetCount),
    randomSeed,
  };
};

export const generateQuizFromPdf = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const {
      topic,
      difficulty = "Medium",
      scheduledFor = "",
      durationMinutes,
      extractedPdfText = "",
      examType: rawExamType = "quiz",
      voiceGender: rawVoiceGender = "female",
    } = req.body;
    const file = req.file;

    if (!file && (!topic || !topic.trim()) && !extractedPdfText.trim()) {
      return res.status(400).json({
        success: false,
        message: "Please enter a subject/topic or upload a PDF document.",
      });
    }

    const isOral =
      rawExamType === "oral" || Boolean(req.originalUrl?.includes("/oral"));
    const examType = isOral ? "oral" : "quiz";
    const voiceGender = rawVoiceGender === "male" ? "male" : "female";
    const targetCount = isOral ? 10 : 20;
    const defaultMins = isOral ? 15 : 20;

    const cleanTopic =
      (topic && topic.trim()) ||
      file?.originalname?.replace(/\.[^/.]+$/, "") ||
      "Academic Subject";
    const pdfText =
      extractedPdfText && extractedPdfText.trim().length > 20
        ? String(extractedPdfText).trim()
        : file
        ? extractTextFromPdfBuffer(getFileBuffer(file))
        : "";

    const { questions: finalQuestions, randomSeed } =
      await buildFreshQuestionsForTopic({
        cleanTopic,
        difficulty,
        pdfText,
        targetCount,
      });

    let parsedSchedule = null;
    if (scheduledFor && String(scheduledFor).trim() !== "") {
      const dt = new Date(scheduledFor);
      if (!Number.isNaN(dt.getTime())) parsedSchedule = dt;
    }

    const quizTitle = isOral
      ? `${cleanTopic} — AI Oral Test (${difficulty} • #${String(randomSeed).slice(0, 4)})`
      : `${cleanTopic} — ${difficulty} Assessment (#${String(randomSeed).slice(0, 4)})`;

    const newQuiz = await Quiz.create({
      studentId,
      examType,
      voiceGender,
      title: quizTitle,
      sourceFileName: file ? file.originalname : `Subject: ${cleanTopic}`,
      difficulty,
      status: "Pending",
      questions: finalQuestions,
      totalQuestions: finalQuestions.length,
      passingPercentage: 60,
      scheduledFor: parsedSchedule,
      durationMinutes: Math.min(
        Math.max(Number(durationMinutes) || defaultMins, 5),
        120
      ),
    });

    return res.status(201).json({
      success: true,
      message: isOral
        ? "10-Question AI Oral Test generated successfully!"
        : "20 Unique Academic Questions generated successfully!",
      quiz: newQuiz,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

const evaluateSpokenOralAnswer = (
  spokenRaw = "",
  options = [],
  correctIndex = 0
) => {
  const spoken = String(spokenRaw || "").toLowerCase().trim();
  if (!spoken) return { matchedIndex: null, isCorrect: false };

  if (/\b(option a|choice a|answer a|first option)\b|^a$/i.test(spoken)) {
    return { matchedIndex: 0, isCorrect: correctIndex === 0 };
  }
  if (/\b(option b|choice b|answer b|second option)\b|^b$/i.test(spoken)) {
    return { matchedIndex: 1, isCorrect: correctIndex === 1 };
  }
  if (/\b(option c|choice c|answer c|third option)\b|^c$/i.test(spoken)) {
    return { matchedIndex: 2, isCorrect: correctIndex === 2 };
  }
  if (
    /\b(option d|choice d|answer d|fourth option|last option)\b|^d$/i.test(
      spoken
    )
  ) {
    return { matchedIndex: 3, isCorrect: correctIndex === 3 };
  }

  let bestIndex = null;
  let bestScore = 0;

  options.forEach((opt, idx) => {
    const normOpt = String(opt || "").toLowerCase().trim();
    if (!normOpt) return;
    if (spoken.includes(normOpt) || normOpt.includes(spoken)) {
      bestIndex = idx;
      bestScore = 100;
      return;
    }
    const optWords = normOpt.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);
    if (optWords.length === 0) return;
    let hitCount = 0;
    optWords.forEach((w) => {
      if (spoken.includes(w)) hitCount += 1;
    });
    const ratio = hitCount / optWords.length;
    if (ratio > bestScore && ratio >= 0.34) {
      bestScore = ratio;
      bestIndex = idx;
    }
  });

  if (bestIndex !== null) {
    return { matchedIndex: bestIndex, isCorrect: bestIndex === correctIndex };
  }
  return { matchedIndex: null, isCorrect: false };
};

export const submitQuiz = async (req, res) => {
  try {
    const { quizId } = req.params;
    const {
      answers = {},
      spokenAnswers = {},
      timeTakenSeconds = 0,
      cheatStrikes = 0,
      autoSubmittedReason = "",
    } = req.body;

    const quiz = await Quiz.findById(quizId);
    if (!quiz)
      return res
        .status(404)
        .json({ success: false, message: "Assessment not found." });

    const isOral =
      quiz.examType === "oral" ||
      Boolean(quiz.title?.toLowerCase().includes("oral"));

    let score = 0;
    quiz.questions = quiz.questions.map((q, index) => {
      let selected =
        answers[index] !== undefined &&
        answers[index] !== null &&
        answers[index] !== "" &&
        Number(answers[index]) >= 0
          ? Number(answers[index])
          : null;

      const spokenText = spokenAnswers[index] || q.spokenAnswerText || "";
      let isCorrect = false;

      if (selected !== null && !Number.isNaN(selected)) {
        isCorrect = selected === q.correctOptionIndex;
      } else if (spokenText) {
        const evalRes = evaluateSpokenOralAnswer(
          spokenText,
          q.options || [],
          q.correctOptionIndex
        );
        selected = evalRes.matchedIndex;
        isCorrect = evalRes.isCorrect;
      }

      if (isCorrect) score += 1;
      return {
        ...q.toObject(),
        selectedOptionIndex: selected,
        spokenAnswerText: spokenText,
        isCorrect,
      };
    });

    const totalQ = quiz.questions.length || (isOral ? 10 : 20);
    const percentage = Math.round((score / totalQ) * 100);
    const passed = percentage >= 60;
    const stars =
      percentage >= 90
        ? 5
        : percentage >= 75
        ? 4
        : percentage >= 60
        ? 3
        : percentage >= 40
        ? 2
        : 1;
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

    quiz.score = score;
    quiz.percentage = percentage;
    quiz.passed = passed;
    quiz.stars = stars;
    quiz.grade = grade;
    quiz.timeTakenSeconds = Number(timeTakenSeconds) || 0;
    quiz.cheatStrikes = Number(cheatStrikes) || 0;
    quiz.autoSubmittedReason = autoSubmittedReason || "";
    quiz.status = "Completed";
    quiz.completedAt = new Date();
    await quiz.save();

    return res.status(200).json({
      success: true,
      quiz,
      reattemptQuiz: null,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const deleteQuiz = async (req, res) => {
  try {
    await Quiz.findByIdAndDelete(req.params.quizId);
    return res
      .status(200)
      .json({ success: true, message: "Assessment deleted permanently." });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// ============================================================================
// 4. STUDY ROADMAP TASKS & 5. 3D NOTEBOOK CRUD
// ============================================================================
export const generateAiTasks = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const { goalOrTopic } = req.body;
    const file = req.file;
    const cleanTopic =
      (goalOrTopic && goalOrTopic.trim()) ||
      file?.originalname?.replace(/\.[^/.]+$/, "") ||
      "Curriculum Mastery";

    const tasksList = [
      {
        moduleName: "Phase 1 • Foundations",
        title: `${cleanTopic}: Core Principles & Architecture`,
        description: `Master foundational definitions, syntax, and governing rules of ${cleanTopic}.`,
        subject: cleanTopic,
        estimatedMinutes: 45,
        priority: "High",
        xpReward: 45,
      },
      {
        moduleName: "Phase 2 • Theoretical Depth",
        title: `${cleanTopic}: Mechanisms & Workflows`,
        description: `Analyze internal workflows, structural interactions, and primary derivations in ${cleanTopic}.`,
        subject: cleanTopic,
        estimatedMinutes: 60,
        priority: "High",
        xpReward: 55,
      },
      {
        moduleName: "Phase 3 • Applied Practice",
        title: `${cleanTopic}: Hands-On Problem Set`,
        description: `Solve intermediate-to-advanced exercises or numericals in ${cleanTopic}.`,
        subject: cleanTopic,
        estimatedMinutes: 60,
        priority: "High",
        xpReward: 65,
      },
      {
        moduleName: "Phase 4 • Evaluation",
        title: `${cleanTopic}: Timed Assessment & Oral Viva`,
        description: `Complete a full 20-question assessment or 10-question AI Oral Test.`,
        subject: cleanTopic,
        estimatedMinutes: 30,
        priority: "High",
        xpReward: 75,
      },
    ];

    const savedTasks = await StudyTask.insertMany(
      tasksList.map((t) => ({
        studentId,
        ...t,
        status: "Pending",
        generatedByAI: true,
      }))
    );

    return res.status(201).json({
      success: true,
      message: "Study Roadmap generated successfully.",
      tasks: savedTasks,
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

export const toggleTaskStatus = async (req, res) => {
  try {
    const task = await StudyTask.findById(req.params.taskId);
    if (!task)
      return res
        .status(404)
        .json({ success: false, message: "Module not found." });
    task.status = task.status === "Pending" ? "Completed" : "Pending";
    await task.save();
    return res.status(200).json({ success: true, task });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const updateTask = async (req, res) => {
  try {
    const { title, description, priority, estimatedMinutes } = req.body;
    const task = await StudyTask.findById(req.params.taskId);
    if (!task)
      return res
        .status(404)
        .json({ success: false, message: "Module not found." });
    if (title) task.title = title;
    if (description) task.description = description;
    if (priority) task.priority = priority;
    if (estimatedMinutes) task.estimatedMinutes = Number(estimatedMinutes);
    await task.save();
    return res.status(200).json({ success: true, task });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const deleteTask = async (req, res) => {
  try {
    await StudyTask.findByIdAndDelete(req.params.taskId);
    return res.status(200).json({ success: true, message: "Module deleted." });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const createManualTask = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const { title, subject, priority = "Medium" } = req.body;
    const newTask = await StudyTask.create({
      studentId,
      title: title || "Custom Study Module",
      subject: subject || "General",
      priority,
      status: "Pending",
      xpReward: 35,
    });
    return res.status(201).json({ success: true, task: newTask });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const createNoteBook = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const {
      title,
      subject = "General",
      inkColor = "#1e3a8a",
      fontFamily = "'Caveat', cursive",
    } = req.body;

    if (!title || !title.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Notebook title is required." });
    }

    const newNote = await NoteBook.create({
      studentId,
      title: title.trim(),
      subject: subject.trim() || "General",
      inkColor,
      fontFamily,
      pages: [
        { pageNumber: 1, text: "", drawing: "" },
        { pageNumber: 2, text: "", drawing: "" },
        { pageNumber: 3, text: "", drawing: "" },
        { pageNumber: 4, text: "", drawing: "" },
      ],
    });

    return res.status(201).json({
      success: true,
      note: newNote,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const updateNoteBook = async (req, res) => {
  try {
    const { noteId } = req.params;
    const { title, subject, pages, inkColor, fontFamily } = req.body;
    const note = await NoteBook.findById(noteId);
    if (!note)
      return res
        .status(404)
        .json({ success: false, message: "Notebook not found." });

    if (title !== undefined && title.trim() !== "") note.title = title.trim();
    if (subject !== undefined && subject.trim() !== "")
      note.subject = subject.trim();
    if (Array.isArray(pages)) note.pages = pages;
    if (inkColor) note.inkColor = inkColor;
    if (fontFamily) note.fontFamily = fontFamily;

    await note.save();
    return res.status(200).json({ success: true, note });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const deleteNoteBook = async (req, res) => {
  try {
    await NoteBook.findByIdAndDelete(req.params.noteId);
    return res
      .status(200)
      .json({ success: true, message: "Notebook deleted permanently." });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const createCustomNotification = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const { type = "welcome", title, message } = req.body;
    const created = await pushNotification({ studentId, type, title, message });
    return res.status(201).json({ success: true, notification: created });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const markAllNotificationsRead = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    await Notification.updateMany(
      { studentId, isRead: false },
      { $set: { isRead: true } }
    );
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const clearAllNotifications = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    await Notification.deleteMany({ studentId });
    return res.status(200).json({ success: true });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const getDashboardAiData = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const studentName = getStudentNameFromReq(req);
    const studentPhone = req.query?.phone || req.body?.phone || "";
    const studentEmail = req.query?.email || req.body?.email || "";
    const studentAvatar = req.query?.avatar || req.body?.avatar || "";

    const facultyIdsSet = await syncAllRegisteredStudentsFromDb();

    const quizzes = await Quiz.find({ studentId }).sort({ createdAt: -1 });
    const tasks = await StudyTask.find({ studentId }).sort({ createdAt: -1 });
    const notes = await NoteBook.find({ studentId }).sort({ createdAt: -1 });
    let chatDoc = await AiChat.findOne({ studentId });
    const notifications = await Notification.find({ studentId })
      .sort({ createdAt: -1 })
      .limit(40);

    const completedQuizzes = quizzes.filter((q) => q.status === "Completed");
    const passedQuizzes = completedQuizzes.filter(
      (q) => q.passed || (q.percentage || 0) >= 60
    );
    const completedTasks = tasks.filter((t) => t.status === "Completed");

    const totalXp =
      completedTasks.reduce((s, t) => s + (t.xpReward || 35), 0) +
      completedQuizzes.reduce((s, q) => s + (q.score || 0) * 10, 0) +
      notes.length * 25 +
      100;

    const level = Math.floor(totalXp / 150) + 1;
    const avgQuizPercentage =
      completedQuizzes.length > 0
        ? Math.round(
            completedQuizzes.reduce((s, q) => s + (q.percentage || 0), 0) /
              completedQuizzes.length
          )
        : 0;

    const currentTier = computeTierBadge(totalXp, avgQuizPercentage);
    const existingProfile = await ScholarProfile.findOne({ studentId });
    const isFacultyCaller =
      existingProfile?.tier === "Faculty" ||
      facultyIdsSet.has(String(studentId)) ||
      facultyIdsSet.has(String(studentEmail).toLowerCase()) ||
      DUMMY_IDS_TO_PURGE.includes(String(studentId));

    if (existingProfile && !isFacultyCaller) {
      const finalPhone = studentPhone || existingProfile.phone || "";
      const finalEmail = studentEmail || existingProfile.studentEmail || "";
      const finalAvatar = studentAvatar || existingProfile.avatar || "";
      const finalName =
        studentName && !DUMMY_NAMES_TO_PURGE.includes(studentName)
          ? studentName
          : existingProfile.studentName;

      await LeaderboardEntry.findOneAndUpdate(
        { studentId },
        {
          studentId,
          studentName: finalName,
          phone: finalPhone,
          email: finalEmail,
          avatar: finalAvatar,
          totalXp,
          level,
          avgAccuracy: avgQuizPercentage,
          quizzesPassed: passedQuizzes.length,
          tasksCompleted: completedTasks.length,
          tier: currentTier,
        },
        { upsert: true, new: true }
      );

      await ScholarProfile.findOneAndUpdate(
        { studentId },
        {
          studentId,
          studentName: finalName,
          studentEmail: finalEmail,
          phone: finalPhone,
          cleanPhone: normalizePhoneDigits(finalPhone),
          avatar: finalAvatar,
          tier: currentTier,
          totalXp,
          level,
          avgAccuracy: avgQuizPercentage,
          lastSeen: new Date(),
        },
        { upsert: true, new: true }
      );
    }

    const rawLeaderboard = await LeaderboardEntry.find({})
      .sort({ totalXp: -1, avgAccuracy: -1 })
      .limit(50);

    const leaderboard = rawLeaderboard.map((entry, idx) => ({
      ...entry.toObject(),
      rank: idx + 1,
      tier: computeTierBadge(entry.totalXp, entry.avgAccuracy),
      isCurrentUser: String(entry.studentId) === String(studentId),
    }));

    return res.status(200).json({
      success: true,
      stats: {
        totalXp,
        level,
        avgQuizPercentage,
        tier: currentTier,
        rank:
          leaderboard.find((e) => String(e.studentId) === String(studentId))
            ?.rank || 1,
      },
      quizzes,
      tasks,
      notes,
      notifications,
      leaderboard,
      messages: chatDoc ? chatDoc.messages : [],
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const clearChatHistory = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    await AiChat.findOneAndUpdate({ studentId }, { messages: [] });
    return res.status(200).json({ success: true, messages: [] });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============================================================================
// 8. SCHOLAR CONNECT, FACULTY DIRECT ACCESS (NO FRIEND REQUEST), POLLS & CHAT
// ============================================================================
export const syncScholarProfile = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    await syncAllRegisteredStudentsFromDb();
    const existing = await ScholarProfile.findOne({ studentId });
    return res.status(200).json({ success: true, profile: existing });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const getSocialOverview = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const studentName = getStudentNameFromReq(req);
    const phone = req.query?.phone || "";
    const avatar = req.query?.avatar || "";
    const email = req.query?.email || "";

    const facultyIdsSet = await syncAllRegisteredStudentsFromDb();

    const myProfile = await ScholarProfile.findOne({ studentId });
    const isCallerFaculty =
      myProfile?.tier === "Faculty" ||
      facultyIdsSet.has(String(studentId)) ||
      (email && facultyIdsSet.has(String(email).toLowerCase()));

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
          if (senderProf) {
            incomingRequests.push({
              ...r.toObject(),
              fromName: senderProf.studentName || r.fromName,
              fromPhone: senderProf.phone || r.fromPhone,
              fromAvatar: senderProf.avatar || r.fromAvatar,
              fromTier: senderProf.tier || r.fromTier || "Bronze",
              fromXp: senderProf.totalXp || 100,
            });
          }
        } else if (r.fromStudentId === studentId) {
          const receiverProf = await ScholarProfile.findOne({
            studentId: r.toStudentId,
          });
          if (receiverProf) {
            outgoingRequests.push({
              ...r.toObject(),
              toName: receiverProf.studentName || r.toName,
              toPhone: receiverProf.phone || r.toPhone,
              toAvatar: receiverProf.avatar || r.toAvatar,
              toTier: receiverProf.tier || r.toTier || "Bronze",
              toXp: receiverProf.totalXp || 100,
            });
          }
        }
      }
    }

    // DIRECT FACULTY <-> STUDENT ACCESS WITHOUT FRIEND REQUESTS:
    // 1. If caller is Faculty: ALL registered profiles are directly in their chat list!
    // 2. If caller is Student: ALL Faculty profiles are directly in their chat list!
    // 3. Also anyone who has exchanged a DirectMessage with caller is in their chat list!
    const allOtherProfiles = await ScholarProfile.find({
      studentId: { $ne: studentId },
    }).sort({ totalXp: -1 });

    for (const prof of allOtherProfiles) {
      if (isCallerFaculty || prof.tier === "Faculty") {
        acceptedFriendIds.add(String(prof.studentId));
      }
    }

    const dmPartners = await DirectMessage.find({
      $or: [{ senderId: studentId }, { receiverId: studentId }],
    })
      .select("senderId receiverId")
      .lean();

    dmPartners.forEach((dm) => {
      const other =
        String(dm.senderId) === String(studentId)
          ? String(dm.receiverId)
          : String(dm.senderId);
      if (other && !other.startsWith("community_") && other !== String(studentId)) {
        acceptedFriendIds.add(other);
      }
    });

    const friendIdsArr = Array.from(acceptedFriendIds);
    const friendProfiles = await ScholarProfile.find({
      studentId: { $in: friendIdsArr },
    });
    const profMap = new Map();
    friendProfiles.forEach((fp) => profMap.set(String(fp.studentId), fp));

    const friendsList = [];
    for (const fId of friendIdsArr) {
      const fp = profMap.get(String(fId));
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

      const isFacultyContact = fp.tier === "Faculty";

      friendsList.push({
        studentId: fId,
        studentName: fp.studentName,
        phone: fp.phone || "",
        studentEmail: fp.studentEmail || "",
        avatar: fp.avatar || "",
        tier: isFacultyContact
          ? "Faculty"
          : computeTierBadge(fp.totalXp, fp.avgAccuracy),
        isFaculty: isFacultyContact,
        totalXp: fp.totalXp || 100,
        level: fp.level || 1,
        avgAccuracy: fp.avgAccuracy || 0,
        lastSeen: fp.lastSeen || null,
        unreadCount,
        lastMessage: lastMsg
          ? {
              text:
                lastMsg.messageType === "poll"
                  ? `📊 Poll: ${lastMsg.sharedPayload?.question || "Vote Now"}`
                  : lastMsg.messageType === "event"
                  ? `📅 Event: ${lastMsg.sharedPayload?.title || "Study Session"}`
                  : lastMsg.messageType === "community-invite"
                  ? `🌐 Invited to ${lastMsg.sharedPayload?.communityName || "Group"}`
                  : lastMsg.messageType === "shared-note"
                  ? `📖 Shared 3D Notebook: ${lastMsg.sharedPayload?.title || "Notes"}`
                  : lastMsg.messageType === "shared-result"
                  ? `🏆 Shared Exam Result: ${lastMsg.sharedPayload?.percentage || 0}%`
                  : lastMsg.messageType !== "text"
                  ? `📎 Sent a ${lastMsg.messageType}`
                  : lastMsg.text,
              createdAt: lastMsg.createdAt,
              senderId: lastMsg.senderId,
            }
          : null,
      });
    }

    friendsList.sort((a, b) => {
      if (a.isFaculty && !b.isFaculty && !a.lastMessage && !b.lastMessage) return -1;
      if (!a.isFaculty && b.isFaculty && !a.lastMessage && !b.lastMessage) return 1;
      const tA = a.lastMessage?.createdAt
        ? new Date(a.lastMessage.createdAt).getTime()
        : 0;
      const tB = b.lastMessage?.createdAt
        ? new Date(b.lastMessage.createdAt).getTime()
        : 0;
      return tB - tA;
    });

    const directory = allOtherProfiles.map((sc) => {
      const isFacultyUser = sc.tier === "Faculty";
      let relation = "none";
      let reqId = null;

      if (isCallerFaculty || isFacultyUser || acceptedFriendIds.has(String(sc.studentId))) {
        relation = isCallerFaculty || isFacultyUser ? "faculty-direct" : "friends";
      } else {
        const outReq = outgoingRequests.find(
          (o) => String(o.toStudentId) === String(sc.studentId)
        );
        const inReq = incomingRequests.find(
          (i) => String(i.fromStudentId) === String(sc.studentId)
        );
        if (outReq) {
          relation = "request-sent";
          reqId = outReq._id;
        } else if (inReq) {
          relation = "request-received";
          reqId = inReq._id;
        }
      }

      return {
        ...sc.toObject(),
        isFaculty: isFacultyUser,
        tier: isFacultyUser
          ? "Faculty"
          : computeTierBadge(sc.totalXp, sc.avgAccuracy),
        relation,
        requestId: reqId,
      };
    });

    const rawCommunities = await StudyCommunity.find({}).sort({ createdAt: -1 });
    const communities = [];
    for (const comm of rawCommunities) {
      const lastCommMsg = await DirectMessage.findOne({
        receiverId: comm.communityId,
      }).sort({ createdAt: -1 });

      const isMember = (comm.members || []).some(
        (m) => String(m.studentId) === String(studentId)
      );

      communities.push({
        ...comm.toObject(),
        isCommunity: true,
        studentId: comm.communityId,
        studentName: comm.name,
        isMember,
        membersCount: (comm.members || []).length,
        lastMessage: lastCommMsg
          ? {
              text:
                lastCommMsg.messageType === "poll"
                  ? `📊 ${lastCommMsg.senderName} created a Poll`
                  : lastCommMsg.messageType === "event"
                  ? `📅 ${lastCommMsg.senderName} scheduled an Event`
                  : lastCommMsg.messageType === "shared-note"
                  ? `📖 ${lastCommMsg.senderName} shared a 3D Notebook`
                  : lastCommMsg.messageType === "shared-result"
                  ? `🏆 ${lastCommMsg.senderName} shared an Exam Result`
                  : lastCommMsg.messageType !== "text"
                  ? `📎 ${lastCommMsg.senderName} sent a ${lastCommMsg.messageType}`
                  : `${lastCommMsg.senderName}: ${lastCommMsg.text}`,
              createdAt: lastCommMsg.createdAt,
            }
          : null,
      });
    }

    return res.status(200).json({
      success: true,
      myProfile: myProfile || {
        studentId,
        studentName,
        studentEmail: email,
        phone,
        avatar,
        tier: isCallerFaculty ? "Faculty" : "Bronze",
      },
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

export const searchScholarsByPhoneOrName = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const rawQuery = String(req.query?.q || "").trim();

    const facultyIdsSet = await syncAllRegisteredStudentsFromDb();
    const myProfile = await ScholarProfile.findOne({ studentId });
    const isCallerFaculty =
      myProfile?.tier === "Faculty" || facultyIdsSet.has(String(studentId));

    const allRequests = await FriendRequest.find({
      $or: [{ fromStudentId: studentId }, { toStudentId: studentId }],
    });

    const getRelationStatus = (targetProfile) => {
      const targetId = targetProfile.studentId;
      if (isCallerFaculty || targetProfile.tier === "Faculty") {
        return { relation: "faculty-direct", requestId: null };
      }

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
      if (received)
        return { relation: "request-received", requestId: received._id };

      return { relation: "none", requestId: null };
    };

    let matchedProfiles = [];
    if (!rawQuery) {
      matchedProfiles = await ScholarProfile.find({
        studentId: { $ne: studentId },
      })
        .sort({ totalXp: -1 })
        .limit(80);
    } else {
      const cleanDigits = normalizePhoneDigits(rawQuery);
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

    const results = matchedProfiles.map((p) => {
      const rel = getRelationStatus(p);
      return {
        ...p.toObject(),
        isFaculty: p.tier === "Faculty",
        tier:
          p.tier === "Faculty"
            ? "Faculty"
            : computeTierBadge(p.totalXp, p.avgAccuracy),
        relation: rel.relation,
        requestId: rel.requestId,
      };
    });

    return res.status(200).json({
      success: true,
      results,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============================================================================
// HANDLES FRIEND REQUESTS + COMMUNITY CREATE / JOIN / LEAVE / INVITE REQUESTS
// ============================================================================
export const sendFriendRequest = async (req, res) => {
  try {
    const fromStudentId = getStudentId(req);
    const {
      toStudentId,
      fromName = "Scholar",
      fromPhone = "",
      fromAvatar = "",
      communityAction = "",
      communityName = "",
      communitySubject = "General Study",
      communityDescription = "",
      communityId = "",
    } = req.body;

    const senderProfile = await ScholarProfile.findOne({
      studentId: fromStudentId,
    });
    const finalSenderName =
      senderProfile?.studentName || fromName || "Scholar";
    const finalSenderAvatar = senderProfile?.avatar || fromAvatar || "";
    const finalSenderTier = senderProfile?.tier || "Bronze";

    // A1. CREATE COMMUNITY
    if (communityAction === "create") {
      if (!communityName.trim()) {
        return res.status(400).json({
          success: false,
          message: "Please enter a Community Name.",
        });
      }

      const newCommId = `community_${Date.now()}_${Math.floor(
        Math.random() * 1000
      )}`;
      const createdComm = await StudyCommunity.create({
        communityId: newCommId,
        name: communityName.trim(),
        subject: communitySubject.trim() || "General Study",
        description:
          communityDescription.trim() ||
          `Study community created by ${finalSenderName}.`,
        creatorId: fromStudentId,
        creatorName: finalSenderName,
        members: [
          {
            studentId: fromStudentId,
            studentName: finalSenderName,
            avatar: finalSenderAvatar,
            tier: finalSenderTier,
          },
        ],
      });

      await DirectMessage.create({
        senderId: fromStudentId,
        senderName: finalSenderName,
        senderAvatar: finalSenderAvatar,
        receiverId: newCommId,
        receiverName: createdComm.name,
        text: `Welcome to "${createdComm.name}" (${createdComm.subject})! Share notes, live polls, PDFs, and study events here.`,
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
    }

    // A2. INVITE / SEND JOIN REQUEST TO ANOTHER USER FOR A COMMUNITY
    if (communityAction === "invite" && communityId && toStudentId) {
      const comm = await StudyCommunity.findOne({ communityId });
      if (!comm) {
        return res.status(404).json({
          success: false,
          message: "Community not found.",
        });
      }

      const targetProf = await ScholarProfile.findOne({
        studentId: toStudentId,
      });
      const targetName = targetProf?.studentName || "Scholar";

      await DirectMessage.create({
        senderId: fromStudentId,
        senderName: finalSenderName,
        senderAvatar: finalSenderAvatar,
        receiverId: toStudentId,
        receiverName: targetName,
        text: `${finalSenderName} invited you to join the study community "${comm.name}" (${comm.subject}).`,
        messageType: "community-invite",
        sharedPayload: {
          communityId: comm.communityId,
          communityName: comm.name,
          subject: comm.subject,
          description: comm.description,
          inviterName: finalSenderName,
        },
      });

      await pushNotification({
        studentId: toStudentId,
        type: "community-invite",
        title: `Community Invite: "${comm.name}"`,
        message: `${finalSenderName} sent you a join request for "${comm.name}" (${comm.subject}). Open Scholar Chat to join!`,
      });

      return res.status(200).json({
        success: true,
        message: `Join invitation for "${comm.name}" sent to ${targetName}!`,
      });
    }

    // A3. JOIN COMMUNITY
    if (communityAction === "join" && communityId) {
      const comm = await StudyCommunity.findOne({ communityId });
      if (!comm) {
        return res.status(404).json({
          success: false,
          message: "Community not found.",
        });
      }

      const alreadyIn = (comm.members || []).some(
        (m) => String(m.studentId) === String(fromStudentId)
      );
      if (!alreadyIn) {
        comm.members.push({
          studentId: fromStudentId,
          studentName: finalSenderName,
          avatar: finalSenderAvatar,
          tier: finalSenderTier,
        });
        await comm.save();

        await DirectMessage.create({
          senderId: fromStudentId,
          senderName: finalSenderName,
          senderAvatar: finalSenderAvatar,
          receiverId: comm.communityId,
          receiverName: comm.name,
          text: `${finalSenderName} joined the community.`,
          messageType: "text",
        });
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
    }

    // A4. LEAVE COMMUNITY
    if (communityAction === "leave" && communityId) {
      const comm = await StudyCommunity.findOne({ communityId });
      if (comm) {
        comm.members = (comm.members || []).filter(
          (m) => String(m.studentId) !== String(fromStudentId)
        );
        await comm.save();
      }
      return res.status(200).json({
        success: true,
        message: "You left the community.",
      });
    }

    // B. STANDARD STUDENT-TO-STUDENT FRIEND REQUEST
    if (!toStudentId || toStudentId === fromStudentId) {
      return res.status(400).json({
        success: false,
        message: "Invalid scholar selected.",
      });
    }

    const targetProfile = await ScholarProfile.findOne({
      studentId: toStudentId,
    });
    if (!targetProfile) {
      return res.status(404).json({
        success: false,
        message: "Registered user profile not found.",
      });
    }

    // If either user is Faculty, auto-accept immediately (no friend request needed)
    if (
      senderProfile?.tier === "Faculty" ||
      targetProfile.tier === "Faculty"
    ) {
      return res.status(200).json({
        success: true,
        message: `Direct chat unlocked with ${targetProfile.studentName}!`,
      });
    }

    const existingReq = await FriendRequest.findOne({
      $or: [
        { fromStudentId, toStudentId },
        { fromStudentId: toStudentId, toStudentId: fromStudentId },
      ],
    });

    if (existingReq) {
      if (existingReq.status === "Accepted") {
        return res.status(200).json({
          success: true,
          message: `You are already connected with ${targetProfile.studentName}!`,
          friendRequest: existingReq,
        });
      }
      if (
        existingReq.status === "Pending" &&
        existingReq.fromStudentId === toStudentId
      ) {
        existingReq.status = "Accepted";
        await existingReq.save();
        return res.status(200).json({
          success: true,
          message: `Connected with ${targetProfile.studentName}!`,
          friendRequest: existingReq,
        });
      }
      existingReq.status = "Pending";
      existingReq.fromStudentId = fromStudentId;
      existingReq.toStudentId = toStudentId;
      await existingReq.save();
      return res.status(200).json({
        success: true,
        message: `Connection request sent to ${targetProfile.studentName}!`,
        friendRequest: existingReq,
      });
    }

    const newReq = await FriendRequest.create({
      fromStudentId,
      fromName: finalSenderName,
      fromPhone: senderProfile?.phone || fromPhone,
      fromAvatar: finalSenderAvatar,
      fromTier: finalSenderTier,
      toStudentId,
      toName: targetProfile.studentName,
      toPhone: targetProfile.phone || "",
      toAvatar: targetProfile.avatar || "",
      toTier: targetProfile.tier || "Bronze",
      status: "Pending",
    });

    await pushNotification({
      studentId: toStudentId,
      type: "friend-request",
      title: `New Connection Request from ${finalSenderName}`,
      message: `${finalSenderName} sent you a connection request on Scholar Connect.`,
    });

    return res.status(201).json({
      success: true,
      message: `Connection request sent to ${targetProfile.studentName}!`,
      friendRequest: newReq,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const respondToFriendRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const { action = "accept" } = req.body;

    const freq = await FriendRequest.findById(requestId);
    if (!freq) {
      return res.status(404).json({
        success: false,
        message: "Request not found.",
      });
    }

    if (action === "accept") {
      freq.status = "Accepted";
      await freq.save();

      await pushNotification({
        studentId: freq.fromStudentId,
        type: "friend-accepted",
        title: `${freq.toName} Accepted Your Connection Request`,
        message: `You and ${freq.toName} can now chat and share resources.`,
      });

      return res.status(200).json({
        success: true,
        message: `You and ${freq.fromName} are now connected!`,
        friendRequest: freq,
      });
    } else {
      freq.status = "Rejected";
      await freq.save();
      return res.status(200).json({
        success: true,
        message: "Request declined.",
        friendRequest: freq,
      });
    }
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const removeFriendOrRequest = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const { targetStudentId } = req.params;

    if (String(targetStudentId).startsWith("community_")) {
      const comm = await StudyCommunity.findOne({
        communityId: targetStudentId,
      });
      if (comm) {
        if (String(comm.creatorId) === String(studentId)) {
          await StudyCommunity.deleteOne({ communityId: targetStudentId });
          await DirectMessage.deleteMany({ receiverId: targetStudentId });
          return res.status(200).json({
            success: true,
            message: "Community deleted permanently.",
          });
        } else {
          comm.members = (comm.members || []).filter(
            (m) => String(m.studentId) !== String(studentId)
          );
          await comm.save();
          return res.status(200).json({
            success: true,
            message: "Left community successfully.",
          });
        }
      }
    }

    await FriendRequest.deleteMany({
      $or: [
        { fromStudentId: studentId, toStudentId: targetStudentId },
        { fromStudentId: targetStudentId, toStudentId: studentId },
      ],
    });

    return res.status(200).json({
      success: true,
      message: "Connection removed.",
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const getDirectMessages = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const { friendId } = req.params;

    const isCommunityChat = String(friendId).startsWith("community_");

    if (isCommunityChat) {
      const messages = await DirectMessage.find({
        receiverId: friendId,
      })
        .sort({ createdAt: 1 })
        .limit(250);

      const community = await StudyCommunity.findOne({
        communityId: friendId,
      });
      return res.status(200).json({
        success: true,
        messages,
        friendProfile: community
          ? {
              ...community.toObject(),
              isCommunity: true,
              studentId: community.communityId,
              studentName: community.name,
            }
          : null,
      });
    }

    await DirectMessage.updateMany(
      { senderId: friendId, receiverId: studentId, isRead: false },
      { $set: { isRead: true } }
    );

    const messages = await DirectMessage.find({
      $or: [
        { senderId: studentId, receiverId: friendId },
        { senderId: friendId, receiverId: studentId },
      ],
    })
      .sort({ createdAt: 1 })
      .limit(250);

    const friendProfile = await ScholarProfile.findOne({
      studentId: friendId,
    });

    return res.status(200).json({
      success: true,
      messages,
      friendProfile,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const sendDirectMessage = async (req, res) => {
  try {
    const senderId = getStudentId(req);
    const {
      senderName = "Scholar",
      senderAvatar = "",
      receiverId,
      receiverName = "Scholar",
      text = "",
      messageType: rawType = "text",
      sharedPayload: rawPayload = null,
    } = req.body;
    const file = req.file;

    if (!receiverId) {
      return res.status(400).json({
        success: false,
        message: "Receiver ID or Community ID is required.",
      });
    }

    let messageType = rawType || "text";
    let mediaUrl = "";
    let fileName = "";
    let fileSize = "";
    let parsedPayload = null;

    if (rawPayload) {
      try {
        parsedPayload =
          typeof rawPayload === "string" ? JSON.parse(rawPayload) : rawPayload;
      } catch (e) {
        parsedPayload = rawPayload;
      }
    }

    if (file) {
      const b64 = getFileBase64(file);
      const mime = file.mimetype || "application/octet-stream";
      mediaUrl = `data:${mime};base64,${b64}`;
      fileName = file.originalname || "Attachment";
      const sizeKb = Math.max(1, Math.round((file.size || 1024) / 1024));
      fileSize =
        sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb} KB`;

      if (mime.startsWith("image/")) messageType = "image";
      else if (mime.startsWith("video/")) messageType = "video";
      else if (mime === "application/pdf") messageType = "pdf";
      else messageType = "file";
    }

    if (!text.trim() && !file && !parsedPayload) {
      return res.status(400).json({
        success: false,
        message: "Please enter a message, poll, event, or attachment.",
      });
    }

    const senderProf = await ScholarProfile.findOne({ studentId: senderId });
    const finalSenderName = senderProf?.studentName || senderName;
    const finalSenderAvatar = senderProf?.avatar || senderAvatar;

    const createdMsg = await DirectMessage.create({
      senderId,
      senderName: finalSenderName,
      senderAvatar: finalSenderAvatar,
      receiverId,
      receiverName,
      text: text.trim(),
      messageType,
      mediaUrl,
      fileName,
      fileSize,
      sharedPayload: parsedPayload,
      isEdited: false,
      isRead: false,
    });

    if (!String(receiverId).startsWith("community_")) {
      const notifPreview =
        messageType === "poll"
          ? `sent a Live Poll: "${parsedPayload?.question || "Vote now"}"`
          : messageType === "event"
          ? `scheduled a Study Session: "${parsedPayload?.title || "Event"}"`
          : messageType === "shared-note"
          ? `shared a 3D Notebook "${parsedPayload?.title || "Notes"}"`
          : messageType === "shared-result"
          ? `shared an Exam Result Scorecard (${parsedPayload?.percentage || 0}%)`
          : messageType !== "text"
          ? `sent you a ${messageType} (${fileName})`
          : text.trim().slice(0, 80);

      await pushNotification({
        studentId: receiverId,
        type: "chat-message",
        title: `New Message from ${finalSenderName}`,
        message: `${finalSenderName}: ${notifPreview}`,
      });
    }

    return res.status(201).json({
      success: true,
      message: createdMsg,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============================================================================
// SUPPORTS MESSAGE EDITING + LIVE POLL VOTING + EVENT RSVP + EMOJI REACTIONS
// ============================================================================
export const editDirectMessage = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const { messageId } = req.params;
    const {
      text = "",
      pollOptionIndex,
      voterName = "Scholar",
      reactionEmoji,
      rsvpAction,
    } = req.body;

    const msg = await DirectMessage.findById(messageId);
    if (!msg) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    // 1. LIVE POLL VOTING
    if (pollOptionIndex !== undefined && msg.sharedPayload) {
      const payload = JSON.parse(JSON.stringify(msg.sharedPayload));
      const options = Array.isArray(payload.options) ? payload.options : [];
      const optIdx = Number(pollOptionIndex);

      if (optIdx >= 0 && optIdx < options.length) {
        // Remove previous vote by this user across all options (single-choice toggle)
        options.forEach((opt, i) => {
          opt.votes = (opt.votes || []).filter(
            (v) => String(v.studentId) !== String(studentId)
          );
          if (i === optIdx) {
            opt.votes.push({
              studentId: String(studentId),
              studentName: voterName,
            });
          }
        });
        payload.options = options;
        msg.sharedPayload = payload;
        msg.markModified("sharedPayload");
        await msg.save();

        return res.status(200).json({
          success: true,
          message: msg,
        });
      }
    }

    // 2. STUDY EVENT RSVP TOGGLE
    if (rsvpAction && msg.sharedPayload) {
      const payload = JSON.parse(JSON.stringify(msg.sharedPayload));
      const attendees = Array.isArray(payload.attendees)
        ? payload.attendees
        : [];
      const exists = attendees.some(
        (a) => String(a.studentId) === String(studentId)
      );
      if (exists) {
        payload.attendees = attendees.filter(
          (a) => String(a.studentId) !== String(studentId)
        );
      } else {
        attendees.push({
          studentId: String(studentId),
          studentName: voterName,
        });
        payload.attendees = attendees;
      }
      msg.sharedPayload = payload;
      msg.markModified("sharedPayload");
      await msg.save();

      return res.status(200).json({
        success: true,
        message: msg,
      });
    }

    // 3. EMOJI REACTION TOGGLE
    if (reactionEmoji) {
      const payload = msg.sharedPayload
        ? JSON.parse(JSON.stringify(msg.sharedPayload))
        : {};
      const reactions = payload.reactions || {};
      const list = Array.isArray(reactions[reactionEmoji])
        ? reactions[reactionEmoji]
        : [];
      if (list.includes(String(studentId))) {
        reactions[reactionEmoji] = list.filter(
          (id) => id !== String(studentId)
        );
      } else {
        reactions[reactionEmoji] = [...list, String(studentId)];
      }
      payload.reactions = reactions;
      msg.sharedPayload = payload;
      msg.markModified("sharedPayload");
      await msg.save();

      return res.status(200).json({
        success: true,
        message: msg,
      });
    }

    // 4. STANDARD TEXT EDIT BY SENDER
    if (!text.trim()) {
      return res.status(400).json({
        success: false,
        message: "Updated message text cannot be empty.",
      });
    }

    if (String(msg.senderId) !== String(studentId)) {
      return res.status(403).json({
        success: false,
        message: "You can only edit your own messages.",
      });
    }

    msg.text = text.trim();
    msg.isEdited = true;
    msg.editedAt = new Date();
    await msg.save();

    return res.status(200).json({
      success: true,
      message: msg,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const deleteDirectMessage = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const { messageId } = req.params;

    const msg = await DirectMessage.findById(messageId);
    if (!msg) {
      return res.status(404).json({
        success: false,
        message: "Message not found.",
      });
    }

    if (String(msg.senderId) !== String(studentId)) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own messages.",
      });
    }

    await DirectMessage.findByIdAndDelete(messageId);

    return res.status(200).json({
      success: true,
      deletedId: messageId,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

export const importSharedNoteBook = async (req, res) => {
  try {
    const studentId = getStudentId(req);
    const { sharedNote } = req.body;

    if (!sharedNote || !sharedNote.title) {
      return res.status(400).json({
        success: false,
        message: "Invalid shared notebook payload.",
      });
    }

    const importedPages =
      Array.isArray(sharedNote.pages) && sharedNote.pages.length > 0
        ? sharedNote.pages.map((p, idx) => ({
            pageNumber: p.pageNumber || idx + 1,
            text: p.text || "",
            drawing: p.drawing || "",
          }))
        : [
            { pageNumber: 1, text: "", drawing: "" },
            { pageNumber: 2, text: "", drawing: "" },
            { pageNumber: 3, text: "", drawing: "" },
            { pageNumber: 4, text: "", drawing: "" },
          ];

    const newNote = await NoteBook.create({
      studentId,
      title: `${sharedNote.title} (Shared by ${
        sharedNote.authorName || "Scholar"
      })`,
      subject: sharedNote.subject || "General",
      inkColor: sharedNote.inkColor || "#1e3a8a",
      fontFamily: sharedNote.fontFamily || "'Caveat', cursive",
      pages: importedPages,
    });

    return res.status(201).json({
      success: true,
      message: "Shared 3D Notebook saved to your Bookshelf!",
      note: newNote,
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
};

// ============================================================================
// 9. EDUCATIONAL COMMUNITIES CONTROLLERS
// ============================================================================
export const createCommunity = async (req, res) => {
  req.body.communityAction = "create";
  return sendFriendRequest(req, res);
};

export const joinCommunity = async (req, res) => {
  req.body.communityAction = "join";
  req.body.communityId = req.params.communityId || req.body.communityId;
  return sendFriendRequest(req, res);
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