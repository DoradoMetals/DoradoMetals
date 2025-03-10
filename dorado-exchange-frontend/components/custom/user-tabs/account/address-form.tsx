"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StateSelect } from "./stateSelect";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

const addressSchema = z.object({
  name: z.string().min(1, "Address Name is required"),
  addressLine1: z.string().min(1, "Address Line 1 is required"),
  addressLine2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  zipCode: z.string().min(1, "Zip Code is required"),
  state: z.string().min(1, "State is required"),
  country: z.string().min(1, "Country is required"),
  defaultAddress: z.boolean().default(false),
});

export default function AddressManager() {
  const [addresses, setAddresses] = useState([
    { id: "1", label: "Home Address", data: { name: "Home Address", addressLine1: "123 Main St", addressLine2: "", city: "New York", zipCode: "10001", state: "NY", country: "United States", defaultAddress: true } },
    { id: "2", label: "Work Address", data: { name: "Work Address", addressLine1: "456 Office Rd", addressLine2: "Suite 500", city: "Los Angeles", zipCode: "90001", state: "CA", country: "United States", defaultAddress: false } },
  ]);
  const [selectedAddressId, setSelectedAddressId] = useState(addresses[0].id);
  const [creatingNew, setCreatingNew] = useState(false);

  const selectedAddress = addresses.find(addr => addr.id === selectedAddressId);

  const addressForm = useForm({
    resolver: zodResolver(addressSchema),
    defaultValues: selectedAddress
      ? selectedAddress.data
      : {
          name: "",
          addressLine1: "",
          addressLine2: "",
          city: "",
          zipCode: "",
          state: "",
          country: "United States",
          defaultAddress: false,
        },
  });

  const getAddresses = async () => {
    // const res = await axiosInstance
  }



  const handleAddressSubmit = (values: z.infer<typeof addressSchema>) => {
    if (creatingNew === true) {
      // createNewAddress(values)
    } else {
      // updateAddress(values)
    }
  };

  useEffect(() => {
    getAddresses()
  }, [getAddresses])

  return (
    <div>
      <h2 className="text-sm text-gray-500 mb-10">Addresses</h2>

      {/* Address Selection & Create New Button */}
      <div className="flex justify-between items-center mb-6">
        {/* Conditionally Render Select or Input for Address Name */}
        {!creatingNew ? (
          <Select onValueChange={setSelectedAddressId} value={selectedAddressId}>
            <SelectTrigger className="w-2/3">
              <SelectValue placeholder="Select Address" />
            </SelectTrigger>
            <SelectContent>
              {addresses.map((address) => (
                <SelectItem key={address.id} value={address.id}>
                  {address.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Input
            placeholder="Address Name"
            {...addressForm.register("name")}
            className="w-2/3 placeholder:font-light font-normal"
          />
        )}

        {/* Create New / Cancel Button */}
        <Button variant="ghost" onClick={() => setCreatingNew(!creatingNew)}>
          {creatingNew ? "Cancel" : "+ Create New"}
        </Button>
      </div>

      {/* Address Form (Always Visible) */}
      <Form {...addressForm}>
        <form onSubmit={addressForm.handleSubmit(handleAddressSubmit)} className="space-y-4">
          <div className="mb-8">
            <FormField
              control={addressForm.control}
              name="addressLine1"
              render={({ field }) => (
                <FormItem>
                  <div className="text-md text-gray-500 m-0 p-0">
                    <FormLabel>Address Line 1</FormLabel>
                  </div>
                  <FormControl>
                    <Input placeholder="Address Line 1" className="placeholder:font-light font-normal" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>

          <div className="mb-8">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={addressForm.control}
                name="addressLine2"
                render={({ field }) => (
                  <FormItem>
                    <div className="text-md text-gray-500 m-0 p-0">
                      <FormLabel>Address Line 2</FormLabel>
                    </div>
                    <FormControl>
                      <Input placeholder="Address Line 2" className="placeholder:font-light font-normal" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={addressForm.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <div className="text-md text-gray-500 m-0 p-0">
                      <FormLabel>City</FormLabel>
                    </div>
                    <FormControl>
                      <Input placeholder="City" className="placeholder:font-light font-normal" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
          </div>

          <div className="mb-8">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={addressForm.control}
                name="zipCode"
                render={({ field }) => (
                  <FormItem>
                    <div className="text-md text-gray-500 m-0 p-0">
                      <FormLabel>Zip Code</FormLabel>
                    </div>
                    <FormControl>
                      <Input placeholder="Zip Code" className="placeholder:font-light font-normal" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={addressForm.control}
                name="state"
                render={({ field }) => <StateSelect value={field.value} onChange={field.onChange} />}
              />
            </div>
          </div>

          <div className="mb-8">
            <FormField
              control={addressForm.control}
              name="defaultAddress"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                  <FormLabel>Make default address</FormLabel>
                </FormItem>
              )}
            />
          </div>

          <Button type="submit" className="w-full">Save Changes</Button>
        </form>
      </Form>
    </div>
  );
}
