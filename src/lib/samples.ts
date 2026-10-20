export const SAMPLE_USER_NAME = "Dev";

export const SAMPLES = [
  { id: "rahul-bday", file: "WhatsApp Chat - Rahul Bday Squad.txt", label: "Rahul Bday Squad", platform: "whatsapp" },
  { id: "sharma-family", file: "WhatsApp Chat with Sharma Family.txt", label: "Sharma Family", platform: "whatsapp" },
  { id: "lakeside-residents", file: "telegram-lakeside-residents.json", label: "Lakeside Residents", platform: "telegram" },
] as const;

export const sampleUrl = (file: string) => `/samples/${encodeURIComponent(file)}`;
