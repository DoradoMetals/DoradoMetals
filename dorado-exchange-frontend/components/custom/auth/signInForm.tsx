"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { FcGoogle } from "react-icons/fc";
import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/lib/authClient";
import Link from "next/link";
import { Logo } from "@/components/icons/logo";
import SignUpButton from "./signUpButton"; // Import SignUp Button

export default function SignInForm() {
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value);
    setErrorMessage(null);
  };

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value);
    setErrorMessage(null);
  };

  const signInUser = async () => {
    const { data, error } = await authClient.signIn.email(
      {
        email,
        password,
      },
      {
        onRequest: (ctx) => { },
        onSuccess: (ctx) => {
          router.push("/"); // Redirect to home on success
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
          <div className="mr-auto">
            <Link href={"/"}>
              <Logo size={50} />
            </Link>
          </div>
          <p className="text-2xl ml-auto">Dorado Metals Exchange</p>
        </div>

        <p className="text-2xl text-gray-500 font-bold mr-auto mb-10">Sign In</p>

        <div className="flex items-center mb-10">
          <Input
            type="email"
            id="email"
            value={email}
            onChange={handleEmailChange}
            placeholder="Email"
            className="invalid:[&:not(:placeholder-shown):not(:focus)]:border-red-500"
          />
        </div>

        <div className="flex items-center mb-10">
          <Input
            type={showPassword ? "text" : "password"}
            id="password"
            value={password}
            onChange={handlePasswordChange}
            placeholder="Password"
            className="invalid:[&:not(:placeholder-shown):not(:focus)]:border-red-500"
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
          onClick={signInUser}
          disabled={!email || !password}
        >
          Sign In
        </Button>

        <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-10">
          New here?{" "}
          <Link href="/sign-up" className="text-primary font-medium">
            Sign Up
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
          <span>Log In with Google</span>
        </Button>
      </div>
    </div>
  );
}
