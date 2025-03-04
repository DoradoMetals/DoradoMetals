import { Chip } from "@heroui/react";
import { Envelope, Phone } from "../icons";


export default function Contact() {
  return (
    <div className="grid grid-cols-2 grid-rows-1 justify-items-center place-items-center">
      <div className="col-start-1 row-start-1">
        <Chip variant="faded">
          <div className="flex items-center gap-3">
            <Phone className="w-6 h-6 text-primary p-1"/>
            <p>(817) 203 - 4786</p>
          </div>
          
        </Chip>
      </div>
      <div className="col-start-2 row-start-1">
      <Chip variant="faded">
          <div className="flex items-center gap-3">
            <Envelope className="w-6 h-6 text-primary p-1"/>
            <p>exchange@doradometals.com</p>
          </div>
        </Chip>
      </div>
    </div>
  );
}
