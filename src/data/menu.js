// Zafraan's menu. `id` matches the 3D builders in scene/dishes.js.
// `meat` is what the dish is made with (all meat is halal); null = vegetarian.
export const MENU = [
  {
    section: 'Off the coals',
    note: 'Grilled to order on the angeethi',
    dishes: [
      {
        id: 'chicken-tikka',
        name: 'Chicken Tikka Boti',
        price: 1150,
        meat: 'Chicken',
        spice: 2,
        time: 15,
        short: 'Boneless chicken in a yoghurt, lemon and red chilli marinade, grilled on the skewer over coal.',
        description:
          'Thigh pieces sit overnight in yoghurt, crushed red chilli, lemon and a little raw papaya, then go onto the skewer over a coal angeethi until the edges catch. Served hot with podina chutney and sliced onion.',
        ingredients: ['Chicken thigh', 'Yoghurt', 'Crushed red chilli', 'Lemon', 'Raw papaya', 'Garam masala', 'Onion', 'Podina chutney'],
      },
      {
        id: 'chapli-kebab',
        name: 'Peshawari Chapli Kebab',
        price: 950,
        meat: 'Beef',
        spice: 2,
        time: 15,
        short: 'Two flat beef kebabs with pomegranate seed and coriander, shallow-fried in tallow with a tomato slice on top.',
        description:
          'Coarse beef mince is kneaded with anardana, crushed coriander seed, green chilli and maize flour, pressed flat by hand and fried in tallow on a wide tawa, the Qissa Khwani way. Comes on a hot naan with chutney.',
        ingredients: ['Beef mince', 'Anardana', 'Crushed coriander seed', 'Green chilli', 'Tomato', 'Maize flour', 'Tallow', 'Naan'],
      },
    ],
  },
  {
    section: 'From the degh',
    note: 'Slow-cooked every morning',
    dishes: [
      {
        id: 'biryani',
        name: 'Karachi Chicken Biryani',
        price: 1250,
        meat: 'Chicken',
        spice: 3,
        time: 20,
        short: 'Long-grain sella rice layered with spiced chicken, potato and aloo bukhara, finished with saffron and mint.',
        description:
          'Chicken cooked down with tomato, yoghurt, green chilli and whole spices is layered with sella basmati, a potato and a few sour aloo bukhara, then steamed on dum with saffron water and fried onion. Comes with cucumber raita.',
        ingredients: ['Sella basmati', 'Chicken on the bone', 'Potato', 'Aloo bukhara', 'Tomato', 'Yoghurt', 'Saffron', 'Fried onion', 'Mint'],
      },
      {
        id: 'chicken-karahi',
        name: 'Lahori Chicken Karahi',
        price: 2400,
        meat: 'Chicken',
        spice: 2,
        time: 25,
        short: 'Half a chicken cooked fast in the iron karahi with tomato, ginger and green chilli. No onion, no shortcuts.',
        description:
          'Chicken on the bone is seared in desi ghee, then cooked down with fresh tomato until the oil rises, finished with black pepper, julienned ginger and slit green chillies. Served in the karahi with roghni naan.',
        ingredients: ['Chicken on the bone', 'Tomato', 'Desi ghee', 'Fresh ginger', 'Green chilli', 'Black pepper', 'Coriander', 'Roghni naan'],
      },
      {
        id: 'nihari',
        name: 'Old Lahore Beef Nihari',
        price: 1450,
        meat: 'Beef',
        spice: 2,
        time: 10,
        short: 'Beef shank and nalli simmered overnight in a deep, spiced gravy, with ginger, chilli and lemon on top.',
        description:
          'Beef shank cooks for eight hours in a sealed degh with bone marrow and the house nihari masala, then the gravy is thickened with atta and finished with a ladle of spiced tari. Topped with ginger, green chilli, fried onion and coriander, with a khameeri roti.',
        ingredients: ['Beef shank', 'Nalli (marrow bone)', 'Nihari masala', 'Atta', 'Desi ghee', 'Fresh ginger', 'Green chilli', 'Lemon', 'Khameeri roti'],
      },
    ],
  },
  {
    section: 'To finish',
    note: 'Something sweet, something hot',
    dishes: [
      {
        id: 'gulab-jamun',
        name: 'Warm Gulab Jamun',
        price: 450,
        meat: null,
        spice: 0,
        time: 8,
        short: 'Three khoya dumplings, fried slow and soaked in rose and cardamom syrup.',
        description:
          'Made from fresh khoya, fried slowly until deep brown all the way through and rested in a warm syrup of rose water, cardamom and saffron. Finished with slivered pistachio.',
        ingredients: ['Khoya', 'Sugar syrup', 'Rose water', 'Green cardamom', 'Saffron', 'Pistachio'],
      },
      {
        id: 'kashmiri-chai',
        name: 'Kashmiri Chai',
        price: 380,
        meat: null,
        spice: 0,
        time: 10,
        short: 'Pink noon chai, whisked until it blushes, with crushed pistachio and almond on top.',
        description:
          'Green tea leaves are boiled down with a pinch of soda and star anise, aerated by the ladle until the colour turns, then simmered with full-cream milk. Served in a clay cup with two house rusks.',
        ingredients: ['Kashmiri green tea', 'Full-cream milk', 'Star anise', 'Green cardamom', 'Pistachio', 'Almond', 'House rusk'],
      },
    ],
  },
];

export const DISHES = MENU.flatMap((s) => s.dishes);
export const dishById = (id) => DISHES.find((d) => d.id === id);

export const formatPrice = (n) => `Rs ${n.toLocaleString('en-PK')}`;
