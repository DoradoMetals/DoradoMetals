import { Chip } from "@heroui/react";
import { Envelope, Phone } from "../icons";


export default function Contact() {
  return (
    <div className="grid grid-cols-2 grid-rows-1 justify-items-center place-items-center">
      <div className="col-start-1 row-start-1">
        <Chip variant="faded">
          <div className="flex items-center gap-3">
            <Phone className="w-6 h-6 text-primary p-1"/>
            <p>(123) 456 - 7890</p>
          </div>
          
        </Chip>
      </div>
      <div className="col-start-2 row-start-1">
      <Chip variant="faded">
          <div className="flex items-center gap-3">
            <Envelope className="w-6 h-6 text-primary p-1"/>
            <p>dorado-metals@outlook.com</p>
          </div>
        </Chip>
      </div>
    </div>
    // <div className="flex items-center space-x-4">
    //   {/* Phone */}
    //   <div className="flex sm:mr-auto items-center space-x-1">
    //     <Phone />
    //     (123) 456-7890
    //   </div>

    //   {/* Contact Us */}
    //   <div className="flex items-center space-x-1">
    //     <Envelope />
    //     <a href="/contact" className="underline">
    //       email@outlook.com
    //     </a>
    //   </div>
    // </div>
  );
}
