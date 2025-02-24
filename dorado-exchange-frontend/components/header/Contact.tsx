import { Envelope, Phone } from "../icons";

export default function Contact() {
  return (
    <div className="flex items-center space-x-4 text-lg">
      {/* Phone */}
      <div className="flex items-center space-x-1">
        <Phone />
        <span>(123) 456-7890</span>
      </div>

      {/* Contact Us */}
      <div className="flex items-center space-x-1">
        <Envelope />
        <a href="/contact" className="underline font-medium">
          email@outlook.com
        </a>
      </div>
    </div>
  );
}
