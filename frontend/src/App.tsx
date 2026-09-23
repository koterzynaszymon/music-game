import { Route, Routes } from "react-router-dom";
import Homepage from "./pages/Homepage";
import RoomPage from "./pages/RoomPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Homepage />} />
      <Route path="/room/:code" element={<RoomPage />} />
    </Routes>
  );
}

export default App;
