/** Page header shared by the CRM tabs: icon chip, title, subtitle and the tab's own actions. */
function CRMHeader({ icon: Icon, title, subtitle, children }) {
  return (
    <header className="crm-ds crm-ov-header">
      <div className="crm-ov-title">
        <span className="crm-ov-chip crm-ov-chip--lg"><Icon size={22} /></span>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      {children && <div className="crm-ov-actions">{children}</div>}
    </header>
  );
}

export default CRMHeader;
