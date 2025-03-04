import { Chip } from "@heroui/react";
import { Envelope, Phone } from "../icons";
import SignupForm from "./SignUpForm";
import ContactLinks from "./ContactLinks";

export default function UnderConstruction() {
  return (
    <div className="relative w-full h-screen overflow-hidden">
      <video
        className="absolute top-0 left-0 w-full h-full object-cover"
        autoPlay
        loop
        muted
        playsInline
      >
        <source src="/coins.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>
      <div className="absolute w-full h-full bg-black bg-opacity-40 flex flex-col items-center sm:items-start justify-center px-6 sm:px-12 md:px-20">
        <h1 className="text-4xl sm:text-5xl md:text-6xl text-primary font-bold mb-3 text-center sm:text-left">
          Welcome to Dorado!
        </h1>
        <p className="text-sm sm:text-md md:text-lg text-white max-w-lg mb-6 text-center sm:text-left">
          Our website will be launching soon! If you would like to be informed when it's live,
          please enter your email address below. In the meantime, contact us via email or phone for all your buying and selling needs!
        </p>
        <SignupForm />
        <ContactLinks />
      </div>
    </div>
  );
}
