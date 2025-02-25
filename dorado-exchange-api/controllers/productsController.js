const products = [
  { code: "1", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true, in_cart: 0, in_queue: 0 },
  { code: "2", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true, in_cart: 0, in_queue: 0 },
  { code: "3", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true, in_cart: 0, in_queue: 0 },
  { code: "4", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true, in_cart: 0, in_queue: 0 },
  { code: "5", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true, in_cart: 0, in_queue: 0 },
  { code: "6", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true, in_cart: 0, in_queue: 0 },
  { code: "7", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true, in_cart: 0, in_queue: 0 },
  { code: "8", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true, in_cart: 0, in_queue: 0 },
  { code: "9", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true, in_cart: 0, in_queue: 0 },
  { code: "10", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true, in_cart: 0, in_queue: 0 },
];

// @desc    Get all products
// @route   GET /api/products
exports.getProducts = async (req, res) => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  await sleep(2000)
  res.json(products);
};