"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sun, Moon } from "lucide-react";

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Button
      variant="link"
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="px-0 text-primary-foreground"
    >
      {theme === "light" ? <Moon className="text-muted-foreground" /> : <Sun className="text-muted-foreground" />}
    </Button>
  );
}
