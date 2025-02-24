const products = [
  { code: "1", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true },
  { code: "2", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true },
  { code: "3", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true },
  { code: "4", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true },
  { code: "5", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true },
  { code: "6", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true },
  { code: "7", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true },
  { code: "8", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true },
  { code: "9", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true },
  { code: "10", name: "Gold American Eagle", image: "/American-Eagle-2022-b.png", price: 2100, availability: true },
];

// @desc    Get all products
// @route   GET /api/products
exports.getProducts = async (req, res) => {
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  await sleep(2000)
  res.json(products);
};