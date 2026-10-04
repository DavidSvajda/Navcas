export const brand = {
  name: "Navčas",
  descriptor: "Materiál pro výrobu",
} as const;
export type ServiceInfo = {
  mode: "demo" | "live";
  loginUrl: string | null;
  operator: {
    name: string;
    address: string;
    ico: string;
    email: string;
    privacyUrl: string;
    termsUrl: string;
  } | null;
};
