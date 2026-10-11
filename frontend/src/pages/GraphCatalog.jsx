import { useState } from "react";
import { useNavigate } from "react-router-dom";
import GraphDirectoryPanel from "../components/GraphDirectoryPanel";
import { getCurrentUser } from "../api";
import { getPreferences } from "../preferences";

export default function GraphCatalog() {
  const navigate = useNavigate();
  const [selectedGraphId, setSelectedGraphId] = useState(
    () => localStorage.getItem("active_graph_id") || getPreferences(getCurrentUser()?.id).defaultGraphId
  );

  const openGraph = (graphId) => {
    localStorage.setItem("active_graph_id", graphId);
    setSelectedGraphId(graphId);
    navigate(`/dashboard/graph/${encodeURIComponent(graphId)}`);
  };

  return (
    <div className="enter">
      <GraphDirectoryPanel
        selectedGraphId={selectedGraphId}
        autoSelect={false}
        onSelect={setSelectedGraphId}
        onOpen={openGraph}
      />
    </div>
  );
}
