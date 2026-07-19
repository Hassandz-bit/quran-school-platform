// صفحة البداية - تحوّل إلى /login تلقائياً
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Home() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    setLocation("/login");
  }, [setLocation]);

  return null;
}
