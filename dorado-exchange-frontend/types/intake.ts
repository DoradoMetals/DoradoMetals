import { BuildingIcon, Icon, MapPinIcon, TruckIcon } from "@phosphor-icons/react";

export enum IntakeMethod {
  PICKUP = 'PICKUP',
  OFFICE_VISIT = 'OFFICE_VISIT',
  MAIL_IN = 'MAIL_IN',
}

export type IntakeOption = {
  method: IntakeMethod;
  header: string ;
  label: string;
  blurb: string;
  icon: Icon
  availability?: 'available' | 'limited' | 'coming_soon';
  notes?: string;
};

export const intakeOptions: IntakeOption[] = [
  {
    method: IntakeMethod.PICKUP,
    header: 'Pickup',
    label: "We'll come to you",
    blurb: "We offer pickup in select locations. Schedule a time and we'll send someone out directly to you.",
    icon: MapPinIcon,
    availability: 'limited',
  },
  {
    method: IntakeMethod.OFFICE_VISIT,
    header: 'Office Visit',
    label: "Visit our offices",
    blurb: "Prefer in person? Schedule an appointment at an office location near you.",
    icon: BuildingIcon,
    availability: 'available',
  },
  {
    method: IntakeMethod.MAIL_IN,
    header: 'Shipping',
    label: "Ship to us",
    blurb: "No pickup or office locations nearby? Use our fully-insured shipping labels with no upfront cost to you.",
    icon: TruckIcon,
    availability: 'available',
  },
];