export interface StockPhoto {
  id: string;
  title: string;
  url: string;
  tags: string[];
}

export const STOCK_PHOTOS: StockPhoto[] = [
  {
    id: "stock-1",
    title: "Golden Hour Serenade",
    url: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=800&q=80",
    tags: ["sunset", "clouds", "golden-hour", "mountains"]
  },
  {
    id: "stock-2",
    title: "Celestial Polaris Vista",
    url: "https://images.unsplash.com/photo-1506318137071-a8e063b4bec0?auto=format&fit=crop&w=800&q=80",
    tags: ["night-sky", "aurora", "stars", "nebula"]
  },
  {
    id: "stock-3",
    title: "Ethereal Pastel Noon",
    url: "https://images.unsplash.com/photo-1534088568595-a066f410bcda?auto=format&fit=crop&w=800&q=80",
    tags: ["clouds", "blue-sky", "minimalist", "bright"]
  },
  {
    id: "stock-4",
    title: "Cosmic Nebula Dust",
    url: "https://images.unsplash.com/photo-1502134249126-9f3755a50d78?auto=format&fit=crop&w=800&q=80",
    tags: ["space", "galaxies", "nebula", "stars"]
  }
];
