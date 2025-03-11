"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StateSelect } from "./stateSelect";
import { useUserStore } from "@/store/useUserStore";
import { useAddress, useUpdateAddress, useDeleteAddress } from "@/lib/queries/useAddresses";
import { Address, addressSchema } from "@/types/address";
import { useEffect, useRef, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

export default function AddressManager() {

  const { user, userPending } = useUserStore();
  const { data, isLoading } = useAddress(user?.id);
  const updateAddressMutation = useUpdateAddress(user?.id);
  const deleteAddressMutation = useDeleteAddress(user?.id);
  const hasInitialized = useRef(false);

  const shouldBeDefault = () => {
    if (!data || data.length === 0) {
      return true;
    }
    return false;
  };

  const toggleDisabled = () => {
    if (creatingNew === true) {
      return false;
    }
    if (data && data.length > 0) {
      data.forEach((address) => {
        if (address.id !== selectedAddress.id && address.is_default === true) {
          return false;
        }
      })
    }
    return true;
  }

  const deleteDisabled = () => {
    if (data && data.length > 1 && !selectedAddress.is_default && creatingNew === false) {
      return false
    }
    return true
  }

  const defaultValues: Address = {
    id: crypto.randomUUID(),
    user_id: user?.id,
    line_1: "",
    line_2: "",
    city: "",
    state: "",
    country: "United States",
    zip: "",
    name: "",
    is_default: shouldBeDefault(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const [creatingNew, setCreatingNew] = useState(false);
  const [selectedAddress, setSelectedAddress] = useState<Address>(defaultValues)

  const handleAddressSubmit = (values: Address) => {
    updateAddressMutation.mutate(values, {
      onSettled: () => {
        setSelectedAddress(values);
        setCreatingNew(false);
      },
    })
  };

  const handleDeleteAddress = () => {
    deleteAddressMutation.mutate(selectedAddress, {
      onSettled: () => {
        resetForm(findDefaultAddress() ?? defaultValues);
        setSelectedAddress(findDefaultAddress());
      }
    });
  };

  const handleSelectChange = (value: string) => {
    setSelectedAddress(findAddress(value));
    resetForm(findAddress(value));
  }

  const findDefaultAddress = () => {
    return data?.find(({ is_default }) => is_default) ?? defaultValues
  }

  const findAddress = (target_id: string) => {
    return data?.find(({ id }) => id === target_id) ?? defaultValues
  }

  const resetForm = (address: Address) => {
    addressForm.reset(address)
  }

  const addressForm = useForm<Address>({
    resolver: zodResolver(addressSchema),
    mode: 'onChange',
    defaultValues: findAddress(selectedAddress.id ?? '') || defaultValues,
  });

  useEffect(() => {
    if (!hasInitialized.current) {
      if (data && data.length > 0) {
        setSelectedAddress(findDefaultAddress());
        resetForm(findDefaultAddress());
      } else {
        setSelectedAddress(defaultValues);
        resetForm(defaultValues);
      }
    }
  }, [data])

  return (
    <div>
      <h2 className="text-sm text-gray-500 mb-10">Addresses</h2>

      {isLoading || userPending ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-full mb-8" />
          <Skeleton className="h-9 w-full mb-8" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full mb-8" />
            <Skeleton className="h-9 w-full mb-8" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-9 w-full mb-8" />
            <Skeleton className="h-9 w-full mb-8" />
          </div>
          <Skeleton className="h-9 w-full mb-8" />
        </div>
      ) : (
        <Form {...addressForm}>
          {data?.length === 0 ? null : (
            <div className="">
              {!creatingNew ? (
                <div className="flex justify-between items-center mb-6">
                  <Select
                    onValueChange={(value) => {
                      handleSelectChange(value);
                    }}
                    value={selectedAddress.id ?? ""}
                  >
                    <SelectTrigger className="w-2/3">
                      <SelectValue placeholder="Select Address" />
                    </SelectTrigger>
                    <SelectContent>
                      {data?.map((address) => (
                        <SelectItem key={address.id} value={address.id ?? ""}>
                          {address.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button className="px-0 hover:bg-background" variant="ghost" onClick={() => { resetForm(defaultValues); setCreatingNew(true); }}>
                    <div className="flex items-center gap-2">
                      <Plus className="w-5 h-5" />
                      Create New
                    </div>
                  </Button>
                </div>
              ) : (
                <div className="flex mb-6">
                  <Button className="ml-auto px-0 hover:bg-background" variant="ghost" onClick={() => { resetForm(findAddress(selectedAddress.id ?? '')); setCreatingNew(false); }}>
                    <div className="flex items-center gap-2">
                      <X className="w-5 h-5" />
                      Cancel
                    </div>
                  </Button>
                </div>
              )}
            </div>
          )}
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
                      <Input placeholder="Name" className="placeholder:font-light font-normal" {...field} />
                    </FormControl>
                    {addressForm.formState.errors.name && (
                      <p className="text-red-500 text-sm">
                        {addressForm.formState.errors.name.message}
                      </p>
                    )}
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
                    {addressForm.formState.errors.line_1 && (
                      <p className="text-red-500 text-sm">
                        {addressForm.formState.errors.line_1.message}
                      </p>
                    )}
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
              <div className="flex">
                {addressForm.formState.errors.city && (
                  <p className="ml-auto text-red-500 text-sm">
                    {addressForm.formState.errors.city.message}
                  </p>
                )}
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
                  render={({ field }) => (
                    <FormItem>
                      <StateSelect value={field.value} onChange={field.onChange} />
                    </FormItem>
                  )}
                />
              </div>
              {addressForm.formState.errors.zip && (
                <p className="text-red-500 text-sm">
                  {addressForm.formState.errors.zip.message}
                </p>
              )}
            </div>

            <div className="mb-8">
              <FormField
                control={addressForm.control}
                name="country"
                render={({ field }) => (
                  <FormItem>
                    <div className="text-md text-gray-500 m-0 p-0">
                      <FormLabel>Country</FormLabel>
                    </div>
                    <FormControl>
                      <Input readOnly placeholder="United States" className="placeholder:font-light font-normal" {...field} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>
            <div className="mb-8">
              <FormField
                control={addressForm.control}
                name="is_default"

                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <Checkbox id="is-default" className="cursor-pointer" disabled={toggleDisabled()} checked={field.value} onCheckedChange={field.onChange} />
                    <FormLabel htmlFor="is-default" className="cursor-pointer">Make default address</FormLabel>
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" className="w-full mb-8" disabled={updateAddressMutation.isPending}>
              {updateAddressMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>

            <Button
              type="button"
              variant="destructive"
              className="w-full text-white bg-red-500 hover:bg-red-600"
              onClick={() => handleDeleteAddress()}
              disabled={deleteDisabled() || deleteAddressMutation.isPending}
            >
              {deleteAddressMutation.isPending ? "Deleting..." : "Delete Address"}
            </Button>
          </form>
        </Form>
      )}
    </div>
  );
}
