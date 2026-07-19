import { useState } from "react";

export interface User {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
}

// في النسخة المستقلة، نقرأ بيانات المستخدم من localStorage
export function useAuth() {
  const [loading] = useState(false);

  let user: User | null = null;
  try {
    const stored = localStorage.getItem("user");
    user = stored ? (JSON.parse(stored) as User) : null;
  } catch {
    user = null;
  }

  const logout = () => {
    localStorage.removeItem("user");
    window.location.href = "/login";
  };

  return { loading, user, logout, isAuthenticated: Boolean(user) };
}
