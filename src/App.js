// src/App.js
import React from "react";
import MainPage from "./MainPage";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export default function App() {
  return (
    <>
      <MainPage />
      <ToastContainer
        position="top-center"
        autoClose={3000}
        hideProgressBar
        newestOnTop
        closeOnClick
        draggable
        pauseOnHover
        style={{ marginTop: "20px", zIndex: 9999 }}
        toastClassName="ios-toast"
      />
      <style>
        {`
          .ios-toast {
            z-index: 9999 !important;
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            border-radius: 16px;
            padding: 12px 16px;
            color: #000;
            font-size: 14px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            border: 1px solid rgba(255,255,255,0.3);
          }
          .ios-toast:hover {
            opacity: 0.95;
          }
        `}
      </style>
    </>
  );
}