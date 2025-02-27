import { useState } from "react";
import { Input, Button, Alert } from "@heroui/react";
import axiosInstance from "@/utils/axiosInstance";

export default function SignupForm() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<{ text: string; color: "success" | "warning" | "danger" } | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const handleSubmit = async () => {
    try {
      const res = await axiosInstance.post("/emails/subscribe", { email });
      setMessage(res.data.message);
      setIsVisible(true);
      setTimeout(() => setIsVisible(false), 3000);
      setEmail("");
    } catch (err) {
      console.error("Axios Error:", err);
      setMessage({ text: "Something went wrong.", color: "danger" });
      setIsVisible(true);
    }
  };

  return (
    <div className="flex flex-col w-full max-w-lg gap-3 mb-4">
      <div className="flex flex-col sm:flex-row items-center gap-3 w-full">
        <Input
          isClearable
          onClear={() => setEmail("")}
          variant="flat"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          classNames={{
            label: "text-white/90",
            input: ["bg-transparent", "text-white/90", "placeholder:text-white-700/50"],
            innerWrapper: "bg-transparent",
            inputWrapper: [
              "shadow-xl",
              "backdrop-saturate-150",
              "hover:bg-default-200/70",
              "group-data-[focus=true]:bg-default-200/50",
              "!cursor-text",
            ],
          }}
        />
        <Button
          color="primary"
          className="px-6 flex items-center w-full md:w-auto"
          isDisabled={!email}
          onPress={handleSubmit}
        >
          Inform Me
        </Button>
      </div>
      {message && (
        <Alert
          className="bg-opacity-10"
          hideIconWrapper
          color={message.color}
          isVisible={isVisible}
          title={message.text}
          variant="flat"
        />
      )}
    </div>
  );
}
