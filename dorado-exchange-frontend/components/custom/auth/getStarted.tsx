import SignUpButton from "./signUpButton";

export default function GetStarted() {
  return (
    <div className="h-screen flex flex-col items-center justify-start px-6 mt-40">
      <div className="bg-card shadow-lg rounded-lg p-8 w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-neutral-800 dark:text-white mb-3">
          Create Account
        </h1>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
          You must sign in or create an account to get started!
        </p>
        <SignUpButton />
      </div>
    </div>
  );
}
