"use client";

import { useCallback, useEffect, useState } from "react";
import jsPDF from "jspdf";
import { CircularProgressbar, buildStyles } from "react-circular-progressbar";

import "react-circular-progressbar/dist/styles.css";
import { Oval } from "react-loader-spinner";
import { useUser } from "@clerk/nextjs";
import { SignInButton, UserButton } from "@clerk/nextjs";

type Analysis = {
  id: string;
  file_name: string;
  created_at: string;
  ai_feedback: string;
  job_description: string;
};

type AnalysisResult = {
  matchScore: number;
  strengths: string[];
  missingSkills: string[];
  suggestions: string[];
};

export default function Home() {
  const { user } = useUser();

  const [jobDescription, setJobDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<Analysis[]>([]);
  const [darkMode, setDarkMode] = useState(false);
  const [errors, setErrors] = useState({
    file: "",
    jobDescription: "",
    auth: "",
  });

  const handleAnalyze = async () => {
    const newErrors = {
      file: "",
      jobDescription: "",
      auth: "",
    };

    if (!file) {
      newErrors.file = "Please upload your resume";
    }

    if (!jobDescription.trim()) {
      newErrors.jobDescription = "Please enter a job description";
    }

    if (!user) {
      newErrors.auth = "Please sign in to analyze resumes";
    }

    setErrors(newErrors);

    if (newErrors.file || newErrors.jobDescription || newErrors.auth) {
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      const userId = user?.id || "";

      formData.append("resume", file as Blob);
      formData.append("jobDescription", jobDescription);
      formData.append("userId", userId);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        let errorMessage = "Unexpected server error";
        const clone = res.clone();

        try {
          const errorData = await clone.json();
          errorMessage = errorData?.error || errorMessage;
        } catch {
          const text = await res.text();
          errorMessage = text || errorMessage;
        }

        alert(errorMessage);
        return;
      }

      let data;
      try {
        data = await res.json();
      } catch {
        alert("Server returned invalid JSON.");
        return;
      }

      setAnalysis(data.result);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchHistory = useCallback(async () => {
    if (!user) return;

    const res = await fetch("/api/history", {
      headers: {
        "x-user-id": user.id,
      },
    });

    const data = await res.json();

    setHistory(data);
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const loadHistory = async () => {
      await fetchHistory();
    };

    void loadHistory();
  }, [user, fetchHistory]);

  const loadAnalysis = (item: Analysis) => {
    try {
      if (item.ai_feedback.startsWith("{")) {
        const parsed = JSON.parse(item.ai_feedback);
        setAnalysis(parsed);
      } else {
        alert("This is an old analysis record. Please create a new analysis.");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const deleteAnalysis = async (id: string) => {
    await fetch(`/api/history/${id}`, {
      method: "DELETE",
      headers: {
        "x-user-id": user?.id || "",
      },
    });

    fetchHistory();
  };

  const downloadPDF = () => {
    if (!analysis) return;

    const doc = new jsPDF();

    doc.setFontSize(18);
    doc.text("Resume Analysis Report", 10, 15);

    doc.setFontSize(12);

    doc.text(`Match Score: ${analysis.matchScore}%`, 10, 30);

    doc.text("Strengths:", 10, 45);

    analysis.strengths?.forEach((item: string, index: number) => {
      doc.text(`• ${item}`, 15, 55 + index * 8);
    });

    let y = 55 + (analysis.strengths?.length || 0) * 8 + 10;

    doc.text("Missing Skills:", 10, y);

    analysis.missingSkills?.forEach((item: string, index: number) => {
      doc.text(`• ${item}`, 15, y + 10 + index * 8);
    });

    y = y + 10 + (analysis.missingSkills?.length || 0) * 8 + 10;

    doc.text("Suggestions:", 10, y);

    analysis.suggestions?.forEach((item: string, index: number) => {
      doc.text(`• ${item}`, 15, y + 10 + index * 8);
    });

    doc.save("resume-analysis-report.pdf");
  };

  return (
    <main
      className={`min-h-screen py-8 px-4 transition-all duration-300 ${
        darkMode ? "bg-slate-900 text-white" : "bg-slate-100 text-black"
      }`}
    >
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div
          className={`rounded-2xl shadow-md p-8 mb-8 ${
            darkMode ? "bg-slate-800 text-white" : "bg-white text-black"
          }`}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold">Smart ATS</h1>

              <p
                className={`mt-2 ${darkMode ? "text-slate-300" : "text-gray-500"}`}
              >
                Analyze your resume against job descriptions using AI-powered
                ATS scoring, skill gap analysis, and personalized
                recommendations.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {user && (
                <span
                  className={`text-sm ${darkMode ? "text-slate-300" : "text-gray-500"}`}
                >
                  Welcome, {user.firstName}
                </span>
              )}

              <button
                onClick={() => setDarkMode(!darkMode)}
                className="bg-gray-800 text-white px-4 py-2 rounded-lg"
              >
                {darkMode ? "☀️ Light" : "🌙 Dark"}
              </button>

              {!user ? (
                <SignInButton mode="modal">
                  <button className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl font-medium transition">
                    Sign In
                  </button>
                </SignInButton>
              ) : (
                <UserButton />
              )}
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div
          className={`rounded-2xl p-8 mb-8 ${
            darkMode ? "bg-slate-800 text-white" : "bg-white shadow-md"
          }`}
        >
          <h2 className="text-xl font-semibold mb-6">Upload Resume</h2>

          <label
            htmlFor="resume-upload"
            className={`block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all
    ${
      darkMode
        ? "border-slate-600 hover:bg-slate-700"
        : "border-blue-400 hover:bg-blue-50"
    }`}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();

              const droppedFile = e.dataTransfer.files[0];

              if (droppedFile) {
                setFile(droppedFile);

                setErrors((prev) => ({
                  ...prev,
                  file: "",
                }));
              }
            }}
          >
            <div className="space-y-3">
              <div className="text-5xl">📄</div>

              <h3 className="text-xl font-semibold">Drag & Drop Resume Here</h3>

              <p className={darkMode ? "text-gray-300" : "text-gray-500"}>
                PDF, DOC, DOCX supported
              </p>

              <div className="inline-block bg-blue-600 text-white px-4 py-2 rounded-lg">
                Browse Files
              </div>

              {file && (
                <p className="text-green-500 font-medium">✅ {file.name}</p>
              )}
            </div>
          </label>
          {errors.file && (
            <p className="text-red-500 text-sm mt-2">{errors.file}</p>
          )}

          <input
            id="resume-upload"
            type="file"
            accept=".pdf,.doc,.docx"
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);

              setErrors((prev) => ({
                ...prev,
                file: "",
              }));
            }}
            className="hidden"
          />

          <textarea
            placeholder="Paste Job Description here..."
            value={jobDescription}
            onChange={(e) => {
              setJobDescription(e.target.value);

              setErrors((prev) => ({
                ...prev,
                jobDescription: "",
              }));
            }}
            rows={8}
            className={`w-full p-4 rounded-lg mt-6 border outline-none focus:ring-2 focus:ring-blue-500 ${
              darkMode
                ? "bg-slate-700 border-slate-600 text-white"
                : "bg-white border-gray-300"
            }`}
          />
          {errors.jobDescription && (
            <p className="text-red-500 text-sm mt-2">{errors.jobDescription}</p>
          )}
          {errors.auth && (
            <p className="text-red-500 text-sm mt-3">{errors.auth}</p>
          )}
          <button
            onClick={handleAnalyze}
            disabled={loading}
            className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition disabled:opacity-50"
          >
            {loading ? (
              <div className="flex items-center gap-2">
                <Oval
                  height={20}
                  width={20}
                  color="#fff"
                  secondaryColor="#fff"
                  strokeWidth={4}
                />
                Analyzing...
              </div>
            ) : (
              "Analyze Resume"
            )}
          </button>
        </div>

        {/* Dashboard */}
        {user && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            <div
              className={`rounded-2xl p-6 ${
                darkMode ? "bg-slate-800 text-white" : "bg-white shadow-md"
              }`}
            >
              <h3 className="text-gray-500 text-sm">Total Analyses</h3>

              <p className="text-4xl font-bold mt-2">{history.length}</p>
            </div>

            <div
              className={`rounded-2xl p-6 ${
                darkMode ? "bg-slate-800 text-white" : "bg-white shadow-md"
              }`}
            >
              <h3 className="text-gray-500 text-sm">Latest Resume</h3>

              <p className="font-semibold mt-2 truncate">
                {history[0]?.file_name || "-"}
              </p>
            </div>
          </div>
        )}

        {/* Analysis Result */}
        {analysis && (
          <div className="space-y-4 mb-8">
            <div
              className={`rounded-2xl p-6 ${
                darkMode
                  ? "bg-slate-800 border border-slate-700"
                  : "bg-white shadow-md"
              }`}
            >
              <h2 className="font-bold text-lg mb-4">Match Score</h2>

              <div className="w-40 h-40 mx-auto">
                <CircularProgressbar
                  value={analysis.matchScore}
                  text={`${analysis.matchScore}%`}
                  styles={buildStyles({
                    pathColor:
                      analysis.matchScore >= 80 ? "#22c55e" : "#f59e0b",
                    textColor: darkMode ? "#ffffff" : "#111827",
                    trailColor: "#d1d5db",
                  })}
                />
              </div>
            </div>

            <div
              className={`rounded-2xl p-6 ${
                darkMode
                  ? "bg-slate-800 border border-slate-700 text-white"
                  : "bg-blue-100 border border-blue-200 text-black"
              }`}
            >
              <h2 className="font-bold text-lg mb-3">Strengths</h2>

              <ul className="space-y-2">
                {analysis.strengths?.map((item: string) => (
                  <li key={item}>✅ {item}</li>
                ))}
              </ul>
            </div>

            <div
              className={`rounded-2xl p-6 ${
                darkMode
                  ? "bg-slate-800 border border-slate-700 text-white"
                  : "bg-red-100 border border-red-200 text-black"
              }`}
            >
              <h2 className="font-bold text-lg mb-3">Missing Skills</h2>

              <ul className="space-y-2">
                {analysis.missingSkills?.map((item: string) => (
                  <li key={item}>❌ {item}</li>
                ))}
              </ul>
            </div>

            <div
              className={`rounded-2xl p-6 ${
                darkMode
                  ? "bg-slate-800 border border-slate-700 text-white"
                  : "bg-yellow-100 border border-yellow-200 text-black"
              }`}
            >
              <h2 className="font-bold text-lg mb-3">Suggestions</h2>

              <ul className="space-y-2">
                {analysis.suggestions?.map((item: string) => (
                  <li key={item}>💡 {item}</li>
                ))}
              </ul>
            </div>

            <button
              onClick={downloadPDF}
              className="bg-black text-white px-6 py-3 rounded-xl"
            >
              Download PDF Report
            </button>
          </div>
        )}

        {/* History */}
        {user && (
          <div
            className={`rounded-2xl p-8 ${
              darkMode
                ? "bg-slate-800 text-white"
                : "bg-white shadow-md text-black"
            }`}
          >
            <h2 className="text-2xl font-bold mb-6">Previous Analyses</h2>

            {history.length === 0 ? (
              <p className="text-gray-500">No analyses available</p>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => loadAnalysis(item)}
                  className={`border rounded-xl p-4 mb-4 cursor-pointer transition
${darkMode ? "border-slate-700 hover:bg-slate-700" : "hover:bg-gray-50"}`}
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="font-semibold">{item.file_name}</p>

                      <p className="text-sm text-gray-500 mt-1">
                        {new Date(item.created_at).toLocaleString()}
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAnalysis(item.id);
                      }}
                      className="mt-3 md:mt-0 text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
      <footer
        className={`text-center mt-12 ${
          darkMode ? "text-gray-400" : "text-gray-500"
        }`}
      >
        Built with Next.js • Groq AI • Supabase • Tailwind CSS
      </footer>
    </main>
  );
}
