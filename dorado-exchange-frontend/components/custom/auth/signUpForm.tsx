"use client";

import { useState } from "react";
import { useRouter } from "next/navigation"; // Import useRouter
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/authClient";
import Link from "next/link";
import { Logo } from "@/components/icons/logo";

export default function SignUpForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [validEmail, setValidEmail] = useState(false);
  const [password, setPassword] = useState("");
  const [validPassword, setValidPassword] = useState(false);
  const [name, setName] = useState("");
  const [image, setImage] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter(); // Initialize router

  const validateEmail = (email: string) => {
    const regex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
    return regex.test(email);
  };

  const validatePassword = (password: string) => {
    return password.length >= 7;
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    setValidEmail(validateEmail(value));
    setErrorMessage(null); // Clear error message on change
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPassword(value);
    setValidPassword(validatePassword(value));
    setErrorMessage(null); // Clear error message on change
  };

  const signUpUser = async () => {
    const { data, error } = await authClient.signUp.email(
      {
        email,
        password,
        name,
        image,
        callbackURL: "/verify-email", // Redirect to verification page
      },
      {
        onRequest: (ctx) => { },
        onSuccess: (ctx) => {
          // Show a message to the user
          setErrorMessage("Check your email to verify your account.");
        },
        onError: (ctx) => {
          if (ctx.error?.message) {
            setErrorMessage(ctx.error.message);
            setTimeout(() => {
              setErrorMessage("");
            }, 3000);
          }
        },
      }
    );
  };


  return (
    <div className="h-screen grid place-items-center">
      <div className="flex flex-col w-full max-w-sm px-5">
        <div className="flex items-center mb-10">
          <Link href={"/"}>
            <Logo size={50} />
          </Link>
          <p className="text-2xl ml-auto">Dorado Metals Exchange</p>
        </div>
        <p className="text-2xl text-gray-500 font-bold mr-auto mb-10">Sign Up</p>
        <div className="flex items-center mb-10">
          <Input
            type="email"
            id="email"
            value={email}
            onChange={handleEmailChange}
            placeholder="Email"
            className={`${!validEmail && email ? "border-red-500" : ""
              } invalid:[&:not(:placeholder-shown):not(:focus)]:border-red-500`}
          />
        </div>

        <div className="flex items-center mb-10">
          <Input
            type={showPassword ? "text" : "password"}
            id="password"
            value={password}
            onChange={handlePasswordChange}
            placeholder="Password"
            className={`${!validPassword && password ? "border-red-500" : ""
              } invalid:[&:not(:placeholder-shown):not(:focus)]:border-red-500`}
          />
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

        {errorMessage && (
          <p className="text-red-500 text-sm text-center mb-1">{errorMessage}</p>
        )}

        <Button
          variant="default"
          type="submit"
          className="group-invalid:pointer-events-none group-invalid:opacity-30 mb-10"
          onClick={signUpUser}
          disabled={!validEmail || !validPassword}
        >
          Sign Up
        </Button>

        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-10">
          Already a member?{" "}
          <Link href="/sign-in" className="text-primary font-medium">
            Sign In
          </Link>
        </p>

        <div className="flex w-full justify-center items-center mb-10">
          <div className="flex-grow">
            <Separator />
          </div>
          <span className="text-sm px-4">or</span>
          <div className="flex-grow">
            <Separator />
          </div>
        </div>

        <Button variant="ghost" className="w-full flex items-center gap-3 py-3">
          <FcGoogle className="text-4xl" />
          <span>Sign Up with Google</span>
        </Button>
      </div>
    </div>
  );
}
