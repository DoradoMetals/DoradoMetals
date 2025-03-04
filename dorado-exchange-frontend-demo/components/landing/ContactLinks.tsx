import { Chip } from "@heroui/react";
import { Envelope, Phone } from "../icons";

export default function ContactLinks() {
  return (
    <div className="flex flex-col sm:flex-row items-center gap-3">
      <Chip className="bg-transparent border-0 text-white text-md" variant="faded">
        <div className="flex items-center gap-1">
          <Phone className="w-6 h-6 text-primary" />
          <a href="tel:+1234567890" className="text-white hover:underline block sm:hidden">
            (817) 203 - 4786
          </a>
          <p className="hidden sm:block">(817) 203 - 4786</p>
        </div>
      </Chip>

      <Chip className="bg-transparent border-0 text-white text-md" variant="faded">
        <div className="flex items-center gap-1">
          <Envelope className="w-6 h-6 text-primary-500" />
          <a href="mailto:dorado-metals@outlook.com" className="text-white hover:underline block sm:hidden">
            exchange@doradometals.com
          </a>
          <p className="hidden sm:block">exchange@doradometals.com</p>
        </div>
      </Chip>
    </div>
  );
}