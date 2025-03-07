"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff } from "lucide-react";

export default function SignUpForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [emailFocused, setEmailFocused] = useState(false);
  const [password, setPassword] = useState("");
  const [passwordFocused, setPasswordFocused] = useState(false);

  return (
    <div className="flex max-w-full h-full items-center justify-center my-12 px-6">
      <Card className="w-full max-w-lg shadow-lg bg-white dark:bg-black p-8">
        <CardHeader>
          <CardTitle className="text-2xl text-gray-800 dark:text-gray-200">Sign Up</CardTitle>
        </CardHeader>
        <CardContent className="mx-10">
          {/* Email Input with Floating Label */}
          <div className="relative mb-8">
            <Label
              htmlFor="email"
              className={`absolute left-4 text-gray-500 text-sm transition-all ${emailFocused || email
                  ? "top-2 text-xs text-gray-600 dark:text-gray-300"
                  : "top-1/2 -translate-y-1/2 text-base"
                }`}
            >
              Email
            </Label>
            <Input
              type="email"
              id="email"
              value={email}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              onChange={(e) => setEmail(e.target.value)}
              placeholder=" "
              className="h-14 px-4 pt-5 pb-2 w-full"
            />
          </div>

          <div className="relative mb-8">
            <Label
              htmlFor="password"
              className={`absolute left-4 text-gray-500 text-sm transition-all ${passwordFocused || password
                  ? "top-2 text-xs text-gray-600 dark:text-gray-300"
                  : "top-1/2 -translate-y-1/2 text-base"
                }`}
            >
              Password
            </Label>

            {/* Input Wrapper with Flex to Keep the Button Inside */}
            <div className="flex items-center w-full">
              <Input
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onFocus={() => setPasswordFocused(true)}
                onBlur={() => setPasswordFocused(false)}
                onChange={(e) => setPassword(e.target.value)}
                placeholder=" "
                className="h-14 px-4 pt-5 pb-2 pr-12 w-full"
              />

              {/* Password Toggle Button - Inside the Input */}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setShowPassword(!showPassword)}
                className="ml-[-3rem] hover:bg-transparent"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </Button>
            </div>
          </div>



          {/* Sign Up Button */}
          <Button variant="default" className="w-full py-3 text-lg">
            Sign Up
          </Button>

          {/* Already have an account */}
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center mt-6">
            Already have an account?{" "}
            <a href="/login" className="text-black dark:text-white font-medium">
              Login
            </a>
          </p>

          {/* OR Divider */}
          <div className="flex w-full justify-center items-center my-8">
            <div className="flex-grow">
              <Separator />
            </div>
            <span className="text-sm text-gray-500 px-4">or</span>
            <div className="flex-grow">
              <Separator />
            </div>
          </div>

          {/* Google Sign Up */}
          <Button variant="outline" className="w-full flex items-center gap-3 py-3 text-lg">
            <FcGoogle className="text-4xl" />
            <span>Sign Up with Google</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
