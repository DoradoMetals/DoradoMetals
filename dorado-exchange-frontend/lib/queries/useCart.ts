import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiRequest } from '@/utils/axiosInstance'
import { Product } from '@/types/product'
import { useUserStore } from '@/store/useUserStore'

const CART_STORAGE_KEY = 'dorado_cart'

const mergeCart = (cart: Product[]): Product[] => {
  const merged = new Map<string, Product>();
  for (const item of cart) {
    const key = item.product_name;
    if (merged.has(key)) {
      merged.get(key)!.quantity = (merged.get(key)!.quantity || 1) + (item.quantity || 1);
    } else {
      merged.set(key, { ...item, quantity: item.quantity || 1 });
    }
  }
  return Array.from(merged.values());
};

const getLocalCart = (): Product[] => {
  if (typeof window === 'undefined') return [];
  const cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || '[]');
  return mergeCart(cart);
};


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

export const useAddToCart = () => {
  const { user } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (product: Product) => {
      if (user?.id) {
        return await apiRequest('POST', '/cart/add_to_cart', {
          user_id: user.id,
          product,
        })
      }
    },
    onMutate: async (product: Product) => {
      await queryClient.cancelQueries({ queryKey: ['cart', user?.id ?? 'guest'] });
      const previousCart = getLocalCart();
    
      const updatedCart = [...previousCart];
      const existing = updatedCart.find(item => item.product_name === product.product_name);
      if (existing) {
        existing.quantity = (existing.quantity || 1) + 1;
      } else {
        updatedCart.push({ ...product, quantity: 1 });
      }
    
      saveLocalCart(updatedCart);
      queryClient.setQueryData(['cart', user?.id ?? 'guest'], updatedCart);
      return { previousCart };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', user?.id ?? 'guest'], refetchType: 'active' })
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(["cart", user?.id ?? "guest"], context.previousCart);
        saveLocalCart(context.previousCart);
      }
    },
  })
}

export const useRemoveFromCart = () => {
  const { user } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (product: Product) => {

      if (user?.id) {
        return await apiRequest('POST', '/cart/remove_from_cart', {
          user_id: user.id,
          product,
        })
      }
    },
    onMutate: async (product: Product) => {
      await queryClient.cancelQueries({ queryKey: ['cart', user?.id ?? 'guest'] });
      const previousCart = getLocalCart();
      const updatedCart = [...previousCart];
      const existingIndex = updatedCart.findIndex(item => item.product_name === product.product_name);
    
      if (existingIndex !== -1) {
        const item = updatedCart[existingIndex];
        if ((item.quantity || 1) > 1) {
          updatedCart[existingIndex] = { ...item, quantity: (item.quantity || 1) - 1 };
        } else {
          updatedCart.splice(existingIndex, 1);
        }
        saveLocalCart(updatedCart);
      }
    
      queryClient.setQueryData(['cart', user?.id ?? 'guest'], updatedCart);
      return { previousCart };
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', user?.id ?? 'guest'], refetchType: 'active' })
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(["cart", user?.id ?? "guest"], context.previousCart);
        saveLocalCart(context.previousCart);
      }
    },
  })
}

export const useRemoveItemFromCart = () => {
  const { user } = useUserStore()
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (product: Product) => {
      console.log('remove item from cart: ', product)

      if (user?.id) {
        return await apiRequest('POST', '/cart/remove_item_from_cart', {
          user_id: user.id,
          product_name: product.product_name,
        })
      }
    },
    onMutate: async (product: Product) => {
      await queryClient.cancelQueries({ queryKey: ['cart', user?.id ?? 'guest'] })
      const previousCart = getLocalCart()

      const updatedCart = previousCart.filter(item => item.product_name !== product.product_name)
      saveLocalCart(updatedCart)

      queryClient.setQueryData(['cart', user?.id ?? 'guest'], updatedCart)
      return { previousCart }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['cart', user?.id ?? 'guest'], refetchType: 'active' })
    },
    onError: (_error, _variables, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(['cart', user?.id ?? 'guest'], context.previousCart)
        saveLocalCart(context.previousCart)
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