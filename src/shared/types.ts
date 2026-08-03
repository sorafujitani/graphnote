export type Graph = {
	id: string;
	title: string;
	created_at: string;
	updated_at: string;
};

export type NodeRecord = {
	id: string;
	graph_id: string;
	title: string;
	body: string;
	x: number;
	y: number;
	created_at: string;
	updated_at: string;
};

export type EdgeRecord = {
	id: string;
	graph_id: string;
	source_id: string;
	target_id: string;
	label: string;
	created_at: string;
};

export type GraphDetail = {
	graph: Graph;
	nodes: NodeRecord[];
	edges: EdgeRecord[];
};

export type CascadeResult = {
	nodeIds: string[];
	edgeIds: string[];
};

export type GraphExport = {
	version: 1;
	exportedAt: string;
	graph: Graph;
	nodes: NodeRecord[];
	edges: EdgeRecord[];
};
