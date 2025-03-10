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
import { apiRequest } from "@/utils/axiosInstance";
import { Address } from "@/types";
import { useUserStore } from "@/store/useUserStore";
import { UUID } from "crypto";
import { Plus, X } from "lucide-react";

const addressSchema = z.object({
  line_1: z.string().min(1, "Address Line 1 is required"),
  line_2: z.string().optional(),
  city: z.string().min(1, "City is required"),
  state: z.string().min(1, "State is required"),
  // country: z.string().min(1, "Country is required"),
  country: z.string().optional(),
  zip: z.string().min(1, "Zip Code is required"),
  is_default: z.boolean().default(false),
  name: z.string().min(1, "Address Name is required"),
});

export default function AddressManager() {

  const { user, session, userPending } = useUserStore();
  const [addresses, setAddresses] = useState<Address[]>([])
  const [selectedAddressID, setSelectedAddressID] = useState('')
  const [creatingNew, setCreatingNew] = useState(false);
  const [hideOptions, setHideOptions] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const addressForm = useForm({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      line_1: '',
      line_2: '',
      city: '',
      state: '',
      country: '',
      zip: '',
      is_default: false,
      name: '',
    },
  });

  const resetForm = () => {
    addressForm.reset({
      line_1: "",
      line_2: "",
      city: "",
      state: "",
      country: "",
      zip: "",
      is_default: false,
      name: "",
    });
  }

  const loadAddressIntoForm = (addressID: string) => {
    const selectedAddress = addresses.find((addr) => addr.id === addressID);
    if (selectedAddress) {
      addressForm.reset({
        line_1: selectedAddress.line_1,
        line_2: selectedAddress.line_2 ?? "",
        city: selectedAddress.city,
        state: selectedAddress.state,
        country: selectedAddress.country ?? "",
        zip: selectedAddress.zip,
        is_default: selectedAddress.is_default ?? false,
        name: selectedAddress.name,
      });
      setCreatingNew(false);
    }
  };

  const getAddresses = async (user_id: UUID) => {
    setIsLoading(true)
    try {
      const data = await apiRequest<Address[]>("GET", "/users/get_addresses", undefined, { user_id: user_id });
      setAddresses(data);

      if (data.length > 0) {
        setHideOptions(false);
      } else {
        setHideOptions(true);
      }

    } catch (error) {
      console.error("Error fetching addresses:", error);
    } finally {
      setIsLoading(false);
    }
  };
  const handleAddressSubmit = async (values: z.infer<typeof addressSchema>) => {
    console.log("Submitting Form with Values:", values);

    try {
      await apiRequest("POST", "/users/create_and_update_address", {
        address: values,
        user_id: user?.id,
        address_id: selectedAddressID,
        creating_new: creatingNew,
      });

      // Refresh address list
      getAddresses(user?.id);
      // Reset form
      addressForm.reset();
      setCreatingNew(true);
      setSelectedAddressID("");
    } catch (error) {
      console.error("Error submitting address:", error);
    }
  };

  useEffect(() => {
    if (!userPending && user?.id) {
      getAddresses(user.id);
    }
  }, [userPending, user?.id]);

  useEffect(() => {
    console.log(hideOptions)
  }, [hideOptions])

  return (
    <div>
      <h2 className="text-sm text-gray-500 mb-10">Addresses</h2>

      {hideOptions ? null :
        <div className="flex justify-between items-center mb-6">
          <Select
            onValueChange={(value) => {
              setSelectedAddressID(value);
              loadAddressIntoForm(value);
            }}
            value={selectedAddressID}
          >
            <SelectTrigger className="w-2/3">
              <SelectValue placeholder="Select Address" />
            </SelectTrigger>
            <SelectContent>
              {addresses.map((address) => (
                <SelectItem key={address.id} value={address.id}>
                  {address.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>


          {!creatingNew ? <Button variant="ghost" onClick={() => { resetForm(), setCreatingNew(true) }}>
            <div className="flex items-center gap-2">
              <Plus className="w-5 h-5" />
              Create New
            </div>
          </Button> : <Button variant="ghost" onClick={() => { loadAddressIntoForm(selectedAddressID), setCreatingNew(false) }}>
            <div className="flex items-center gap-2">
              <X className="w-5 h-5" />
              Cancel
            </div>
          </Button>
          }
        </div>
      }

      <Form {...addressForm}>
        <form onSubmit={addressForm.handleSubmit(handleAddressSubmit)} className="space-y-4">

          <div className="mb-8">
            <FormField
              control={addressForm.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <div className="text-md text-gray-500 m-0 p-0">
                    <FormLabel>Name</FormLabel>
                  </div>
                  <FormControl>
                    <Input placeholder="Home, Business etc..." className="placeholder:font-light font-normal" {...field} />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div className="mb-8">
            <FormField
              control={addressForm.control}
              name="line_1"
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
                name="line_2"
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
                name="zip"
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
              name="is_default"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <Checkbox checked={field.value ?? false} onCheckedChange={field.onChange} />
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
