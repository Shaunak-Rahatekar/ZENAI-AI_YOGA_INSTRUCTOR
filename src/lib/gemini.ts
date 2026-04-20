import { GoogleGenAI, Type, Modality } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("GEMINI_API_KEY is missing from environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || '' });

export interface Pose {
  name: string;
  duration: number;
  instruction: string;
  imageSeed: string;
}

export interface YogaRoutine {
  name: string;
  description: string;
  poses: Pose[];
  targetLevel: string;
}

export async function generateYogaRoutine(age: number, bmi: number): Promise<YogaRoutine> {
  try {
    const prompt = `Act as an expert Yoga Instructor. Create a personalized 15-minute yoga routine for a ${age}-year-old individual with a BMI of ${bmi.toFixed(1)}. 
    The routine should be safe, effective, and tailored to their physical profile.
    Suggest a sequence of poses with duration and specific instructions for each.
    For each pose, provide a simple 'imageSeed' which is a single word describing the pose for a placeholder image (e.g., 'yoga-stretching', 'yoga-balance', 'yoga-meditation'). Ensure the seed is descriptive and includes the word 'yoga' for better relevance.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            description: { type: Type.STRING },
            targetLevel: { type: Type.STRING },
            poses: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  duration: { type: Type.NUMBER, description: "Duration in seconds" },
                  instruction: { type: Type.STRING },
                  imageSeed: { type: Type.STRING, description: "A simple keyword for a placeholder image" }
                },
                required: ["name", "duration", "instruction", "imageSeed"]
              }
            }
          },
          required: ["name", "description", "poses", "targetLevel"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    return JSON.parse(text) as YogaRoutine;
  } catch (error: any) {
    console.error("Yoga Routine API Exhausted, using sanctuary fallback:", error);
    // Standard Fallback Routine
    return {
      name: "Sanctuary Standard Flow",
      description: "A foundational restorative flow designed as a fallback for when the AI is recalibrating.",
      targetLevel: "All Levels",
      poses: [
        { name: "Mountain Pose", duration: 30, instruction: "Stand tall, feet together, shoulders relaxed. Breathe deeply.", imageSeed: "yoga-standing" },
        { name: "Child's Pose", duration: 45, instruction: "Kneel, sit on heels, and fold forward, resting forehead on the ground.", imageSeed: "yoga-rest" },
        { name: "Cat-Cow", duration: 60, instruction: "On all fours, inhale to arch back, exhale to round spine.", imageSeed: "yoga-spine" },
        { name: "Downward Facing Dog", duration: 45, instruction: "Lift hips high to form a V-shape. Press heels toward the mat.", imageSeed: "yoga-stretch" }
      ]
    };
  }
}

export async function generatePoseAudio(poseName: string, instruction: string): Promise<string> {
  try {
    const prompt = `You are a professional yoga instructor. Briefly and calmly explain the ${poseName} pose and the correct stance: ${instruction}`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Failed to generate audio");
    return base64Audio;
  } catch (error) {
    console.error("Pose Audio Quota Hit:", error);
    return ""; // Return empty string to skip audio guidance gracefully
  }
}
export async function analyzePosture(base64Image: string, poseName: string): Promise<{ audio: string, text: string }> {
  try {
    // Phase 1: Analyze image to get text feedback
    const analysisPrompt = `You are a real-time AI Yoga Instructor. Analyze this image of the user performing the ${poseName} pose. 
    Check their alignment, limb positioning, and overall balance. 
    If they are doing well, return 'PERFECT'.
    If you notice a specific error, give a short, actionable correction in text (max 10 words).
    If it's hard to see them, return 'SILENT'.`;

    const analysisResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          parts: [
            { text: analysisPrompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
          ]
        }
      ]
    });

    const feedbackText = analysisResponse.text?.trim() || "";
    
    if (feedbackText === "SILENT" || feedbackText === "") {
      return { audio: "", text: "" };
    }

    const ttsText = feedbackText === "PERFECT" 
      ? "Perfect form, keep it up." 
      : feedbackText;

    // Phase 2: Convert feedback text to audio
    const ttsResponse = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: ttsText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      }
    });

    return { 
      audio: ttsResponse.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "",
      text: feedbackText
    };
  } catch (error) {
    console.error("Critical Gemini API error in analyzePosture:", error);
    return { audio: "", text: "" };
  }
}

export async function generateMeditationAudio(durationMinutes: number): Promise<string> {
  try {
    const prompt = `Lead a peaceful, guided meditation session for ${durationMinutes} minutes.
    Focus on breath, bodily awareness, and mental clarity. 
    Speak calmly and provide pauses for reflection.`;

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Failed to generate audio");
    return base64Audio;
  } catch (error) {
    console.error("Meditation Quota Hit, using session silence fallback:", error);
    // Ideally we could return a small pre-recorded instruction, but here we'll return empty
    // to allow the UI to handle it as "Silent Session"
    return ""; 
  }
}

export interface GrowthReport {
  summary: string;
  focusArea: string;
  zenQuote: string;
  suggestedFocusForNextTime: string;
}

export async function generateGrowthReport(corrections: string[]): Promise<GrowthReport> {
  try {
    const prompt = `You are a Zen Master and Yoga Instructor. Analyze the feedback given during a session: 
    ${corrections.join(', ')}. 
    Generate a growth report including:
    1. A meaningful 2-sentence summary of the session's quality.
    2. The primary physical focus area identified (e.g., 'Spinal Alignment', 'Hip Mobility').
    3. A short original Zen quote for inspiration.
    4. One specific focal point for their next session.
    Return as JSON.`;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            focusArea: { type: Type.STRING },
            zenQuote: { type: Type.STRING },
            suggestedFocusForNextTime: { type: Type.STRING }
          },
          required: ["summary", "focusArea", "zenQuote", "suggestedFocusForNextTime"]
        }
      }
    });

    return JSON.parse(response.text || "{}") as GrowthReport;
  } catch (error) {
    console.error("Growth Report Quota Hit:", error);
    return {
      summary: "Your progress is noted in the stillness of your practice. Continue your journey with consistency.",
      focusArea: "Self-Awareness",
      zenQuote: "Quiet the mind, and the soul will speak.",
      suggestedFocusForNextTime: "Mindful Breathing"
    };
  }
}
