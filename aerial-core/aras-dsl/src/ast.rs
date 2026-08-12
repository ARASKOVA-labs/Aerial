use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct NodeId(pub String);

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Group {
    pub name: String,
    pub stmts: Vec<Stmt>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Stmt {
    Type(String),
    Group(Group),
    NodeDecl(NodeId, String),
    Node(NodeId),
    Conn(NodeId, NodeId, Option<String>),
    Style(NodeId, Vec<(String, String)>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
pub struct Diagram {
    pub stmts: Vec<Stmt>,
}
