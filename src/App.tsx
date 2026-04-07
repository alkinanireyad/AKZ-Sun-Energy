import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import SolarDesigner from "@/pages/SolarDesigner";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SolarDesigner />
      <Toaster />
    </QueryClientProvider>
  );
}

export default App;
