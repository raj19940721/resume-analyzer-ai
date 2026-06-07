import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { supabase } from "@/lib/supabase";
import pdf from "pdf-parse/lib/pdf-parse.js";

const getGroqClient = () => {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not configured");
  }
  return new Groq({ apiKey });
};

const parsePotentialJson = (raw: string) => {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      const candidate = trimmed.slice(firstBrace, lastBrace + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        const match = candidate.match(/\{[\s\S]*\}/m);
        if (match) {
          try {
            return JSON.parse(match[0]);
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
};

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const file = formData.get("resume");
    const jobDescription = formData.get("jobDescription");
    const userId = formData.get("userId");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "Resume file is required" },
        { status: 400 },
      );
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json(
        { error: "File size should be less than 5MB" },
        { status: 400 },
      );
    }

    if (!jobDescription || typeof jobDescription !== "string") {
      return NextResponse.json(
        { error: "Job description is required" },
        { status: 400 },
      );
    }

    if (!userId || typeof userId !== "string") {
      return NextResponse.json(
        { error: "User ID is required" },
        { status: 400 },
      );
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json(
        {
          error: "Only PDF files are supported currently",
        },
        {
          status: 400,
        },
      );
    }

    const client = getGroqClient();

    // Extract Resume Text
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const parsedPdf = await pdf(buffer);

    const resumeText = parsedPdf.text;

    const completion = await client.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content: `You are an expert ATS resume analyzer. You must respond with a single JSON object and nothing else. Do not include markdown, code fences, explanations, or any extra text.

Return valid JSON only in the exact shape below. If a field is missing, return an empty array or 0 as appropriate.

Output schema:
{
  "matchScore": 0,
  "strengths": [],
  "missingSkills": [],
  "suggestions": []
}
`,
        },
        {
          role: "user",
          content: `Resume Content:
${resumeText}

Job Description:
${jobDescription}

Analyze the resume against the job description and return a JSON object with these fields:
- matchScore: integer from 0 to 100
- strengths: array of key resume strengths relevant to the JD
- missingSkills: array of skills mentioned in the JD but not present in the resume
- suggestions: array of actionable suggestions for improving the resume

Return ONLY valid JSON.
`,
        },
      ],
    });

    const rawResult =
      completion.choices?.[0]?.message?.content?.toString?.() || "{}";
    const parsedResult = parsePotentialJson(rawResult);

    let result = parsedResult;

    if (!result || typeof result !== "object") {
      result = {
        matchScore: 0,
        strengths: [],
        missingSkills: [],
        suggestions: ["Unable to parse AI response"],
      };
    }

    result = {
      matchScore:
        typeof result.matchScore === "number"
          ? Math.round(result.matchScore)
          : 0,
      strengths: Array.isArray(result.strengths)
        ? result.strengths.map(String)
        : [],
      missingSkills: Array.isArray(result.missingSkills)
        ? result.missingSkills.map(String)
        : [],
      suggestions: Array.isArray(result.suggestions)
        ? result.suggestions.map(String)
        : ["Unable to parse AI response"],
    };

    const { error } = await supabase.from("analyses").insert([
      {
        user_id: userId,
        file_name: file.name,
        job_description: jobDescription,
        ai_feedback: JSON.stringify(result),
      },
    ]);

    if (error) {
      return NextResponse.json(
        {
          error: "Failed to save analysis",
        },
        {
          status: 500,
        },
      );
    }

    return NextResponse.json({
      result,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: error?.message || String(error),
      },
      {
        status: 500,
      },
    );
  }
}
