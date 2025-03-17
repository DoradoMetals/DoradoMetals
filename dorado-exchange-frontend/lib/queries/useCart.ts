import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { Product } from '@/types'
import { useUserStore } from '@/store/useUserStore'

// Local Storage Helpers
const CART_STORAGE_KEY = 'dorado_cart'

const getLocalCart = (): Product[] => {
  if (typeof window === 'undefined') return []
  return JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]')
}

const saveLocalCart = (cart: Product[]) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  }
}

export const useCart = () => {
  const { user } = useUserStore();
  const queryClient = useQueryClient();

  const syncCartMutation = useMutation({
    mutationFn: async (localCart: Product[]) => {
      return await apiRequest("POST", "/cart/sync_cart", { user_id: user.id, cart: localCart });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({queryKey: ["cart", user?.id ?? "guest"], refetchType: 'active'});
    },
  });

  return useQuery<Product[]>({
    queryKey: ['cart', user?.id ?? 'guest'],
    queryFn: async () => {

      const localCart = getLocalCart();

      if (localCart.length === 0 && user?.id) {
        const cart = await apiRequest<Product[]>('GET', '/cart/get_cart', undefined, {user_id: user.id})
        saveLocalCart(cart)
        return cart
      }

      if (localCart.length > 0 && user?.id && localStorage.getItem('cartSynced') !== 'true') {
        localStorage.setItem('cartSynced', 'true');
        syncCartMutation.mutate(localCart);
        return localCart;
      }

      return localCart;
    },
    enabled: true,
  })
}

export const useAddToCart = (product: Product) => {
  const { user } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (user?.id) {
        return await apiRequest('POST', '/cart/add_to_cart', {
          user_id: user.id,
          product,
        })
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['cart', user?.id ?? 'guest'] })
      const previousCart = getLocalCart();
      const updatedCart = [...previousCart || [], product]
      saveLocalCart(updatedCart);
      queryClient.setQueryData(['cart', user?.id ?? 'guest'], updatedCart)
      return { previousCart }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', user?.id ?? 'guest'], refetchType: 'active' })
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(["cart", user?.id ?? "guest"], context.previousCart);
        saveLocalCart(context.previousCart); // Restore localStorage if error occurs
      }
    },
  })
}

export const useRemoveFromCart = (product: Product) => {
  const { user } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (user?.id) {
        return await apiRequest('POST', '/cart/remove_from_cart', {
          user_id: user.id,
          product,
        })
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: ['cart', user?.id ?? 'guest'] })
      const previousCart = getLocalCart();
      const productToRemove = previousCart.findIndex((item) => item.id === product.id)
      const updatedCart = [...previousCart];

      if (productToRemove !== -1) {
        updatedCart.splice(productToRemove, 1)
        saveLocalCart(updatedCart)
      }
      queryClient.setQueryData(['cart', user?.id ?? 'guest'], updatedCart)
      return { previousCart }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', user?.id ?? 'guest'], refetchType: 'active' })
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(["cart", user?.id ?? "guest"], context.previousCart);
        saveLocalCart(context.previousCart); // Restore localStorage if rollback needed
      }
    },
  })
}

export const useClearCart = () => {
  const { user } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('User is not authenticated')
      return await apiRequest('POST', '/cart/clear_cart', {
        user_id: user.id,
      })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', user], refetchType: 'active' })
    },
  })
}


// export const useCart = () => {
//   const { user } = useUserStore()
//   const queryClient = useQueryClient()

//   return useQuery<Product[]>({
//     queryKey: ['cart', user?.id], // Separate carts for guests & users
//     queryFn: async () => {
//       const localCart = getLocalCart()

//       if (!user?.id) {
//         return localCart // ✅ Non-signed-in users rely entirely on localStorage
//       }

//       // 🔹 Fetch server cart for signed-in users
//       const serverCart = await apiRequest<Product[]>('GET', '/cart/get_cart', undefined, {
//         user_id: user.id,
//       })

//       // 🔹 Merge localCart with serverCart (avoid duplicates)
//       const mergedCart = [...serverCart]
//       localCart.forEach((localItem) => {
//         if (!mergedCart.some((serverItem) => serverItem.id === localItem.id)) {
//           mergedCart.push(localItem)
//         }
//       })

//       // 🔹 Sync local items to backend (only send missing items)
//       const itemsToSync = localCart.filter(
//         (localItem) => !serverCart.some((serverItem) => serverItem.id === localItem.id)
//       )
//       if (itemsToSync.length > 0) {
//         await Promise.all(
//           itemsToSync.map((product) =>
//             apiRequest('POST', '/cart/add_to_cart', { user_id: user.id, product })
//           )
//         )
//       }

//       saveLocalCart(mergedCart) // ✅ Update localStorage with merged cart
//       queryClient.setQueryData(['cart', user?.id ?? 'guest'], mergedCart) // ✅ Sync cache

//       return mergedCart
//     },
//     initialData: getLocalCart(), // ✅ Local storage is the first source of truth
//     enabled: true, // Always enabled
//     staleTime: 5000, // Data stays fresh for 5s
//     refetchInterval: 5000, // Auto-refresh every 5s
//   })
// }