import { Chip } from "@heroui/react";
import { Envelope, Phone } from "../icons";

export default function ContactLinks() {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      {/* Phone */}
      <Chip className="bg-transparent border-0 text-white text-md" variant="faded">
        <div className="flex items-center gap-1">
          <Phone className="w-6 h-6 text-primary" />
          {/* Mobile: Clickable */}
          <a href="tel:+1234567890" className="text-white hover:underline block sm:hidden">
            (123) 456 - 7890
          </a>
          {/* Desktop: Static text */}
          <p className="hidden sm:block">(123) 456 - 7890</p>
        </div>
      </Chip>

      {/* Email */}
      <Chip className="bg-transparent border-0 text-white text-md" variant="faded">
        <div className="flex items-center gap-1">
          <Envelope className="w-6 h-6 text-primary" />
          {/* Mobile: Clickable */}
          <a href="mailto:dorado-metals@outlook.com" className="text-white hover:underline block sm:hidden">
            dorado-metals@outlook.com
          </a>
          {/* Desktop: Static text */}
          <p className="hidden sm:block">dorado-metals@outlook.com</p>
        </div>
      </Chip>
    </div>
  );
}