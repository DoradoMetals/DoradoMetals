function assignScrapItemNames(scrapItems) {
  const metalOrder = ["Gold", "Silver", "Platinum", "Palladium"];

  const validScrapItems = scrapItems.filter((item) => item.scrap?.metal);

  validScrapItems.sort((a, b) => {
    const indexA = metalOrder.indexOf(a.scrap.metal);
    const indexB = metalOrder.indexOf(b.scrap.metal);
    return indexA - indexB;
  });

  const grouped = {};

  validScrapItems.forEach((item) => {
    const metal = item.scrap.metal;
    if (!grouped[metal]) grouped[metal] = [];
    grouped[metal].push(item);
  });

  return validScrapItems.map((item) => {
    const metal = item.scrap.metal;
    const group = grouped[metal];
    const index = group.indexOf(item);

    return {
      ...item,
      scrap: {
        ...item.scrap,
        name: `${metal} Item ${index + 1}`,
      },
    };
  });
}

module.exports = {
  assignScrapItemNames,
};
