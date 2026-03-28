import React from "react";

const ArrowIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z" />
  </svg>
);

export function BrokenDashboard() {
  return (
    <div className="ml-6 pr-4 text-left">
      <header className="flex justify-between border-l-2 border-blue-500 pl-4">
        <h1 className="text-left float-right">לוח בקרה</h1>
        <button className="ml-2 rounded-tl-lg rounded-bl-lg bg-blue-600 text-white px-4 py-2">
          <ArrowIcon />
          הבא
        </button>
      </header>

      <section style={{ marginLeft: "16px", paddingRight: "12px" }}>
        <div className="border-l-4 border-green-500 pl-3 ml-4">
          <p>הזמנה מספר #12345 התקבלה בהצלחה</p>
          <p>סכום לתשלום: 249.90₪ (כולל VAT)</p>
          <p>מספר טלפון ליצירת קשר: 03-9876543</p>
        </div>
      </section>

      <footer className="text-left ml-6 pr-2">
        <p>נשלח ב 25/03/2026 על ידי System Admin</p>
        <a href="/next" className="float-left ml-2">
          <ArrowIcon />
          לעמוד הבא
        </a>
      </footer>
    </div>
  );
}
