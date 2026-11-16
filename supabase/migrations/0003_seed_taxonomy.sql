-- Starter taxonomy: Industry → Functional Domain → Specialisation. Fully editable from the admin panel.
create or replace function pg_temp.slugify(t text) returns text language sql immutable as $$
  select trim(both '-' from regexp_replace(lower(t), '[^a-z0-9]+', '-', 'g')) $$;

create or replace function pg_temp.seed_tax(p_sort int, p_industry text, p_tree jsonb) returns void language plpgsql as $$
declare v_ind int; v_dom int; d record; s text;
begin
  insert into public.industries (slug, name, sort_order) values (pg_temp.slugify(p_industry), p_industry, p_sort) returning id into v_ind;
  for d in select key, value from jsonb_each(p_tree) loop
    insert into public.functional_domains (industry_id, slug, name) values (v_ind, pg_temp.slugify(d.key), d.key) returning id into v_dom;
    for s in select jsonb_array_elements_text(d.value) loop
      insert into public.specialisations (industry_id, domain_id, slug, name) values (v_ind, v_dom, pg_temp.slugify(s), s)
      on conflict (industry_id, slug) do nothing;
    end loop;
  end loop;
end $$;

select pg_temp.seed_tax(1, 'Civil Engineering and Infrastructure', '{
  "Design and Engineering": ["Bridge Engineering","Structural Engineering","Highway Engineering","Geotechnical Engineering","Tunnelling","Structural Analysis","Design Checking","Prestressed Concrete","Steel Structures","Cable-Stayed Bridges","BIM Management","Revit"],
  "Rail and Transit": ["Metro Rail","Railway Infrastructure"],
  "Construction and Site": ["Construction Management","Site Execution","QA/QC","Infrastructure Inspection"],
  "Project Controls and Commercial": ["Project Management","Planning and Scheduling","Quantity Surveying","Contract Management"]}');
select pg_temp.seed_tax(2, 'Mechanical Engineering', '{
  "Design": ["Product Design","CAD/CAE","HVAC Design","Piping Design","Tool and Die Design"],
  "Plant and Maintenance": ["Plant Maintenance","Rotating Equipment","Reliability Engineering","Utilities"],
  "Production": ["Production Engineering","Quality Engineering","Automotive Engineering"]}');
select pg_temp.seed_tax(3, 'Electrical Engineering', '{
  "Power": ["Power Systems","Substation Design","Transmission and Distribution","Renewable Energy","Solar PV"],
  "Industrial": ["Electrical Maintenance","Instrumentation and Control","PLC/SCADA","MEP Electrical"]}');
select pg_temp.seed_tax(4, 'Electronics and Telecommunications', '{
  "Electronics": ["Embedded Systems","VLSI Design","PCB Design","Semiconductor Verification"],
  "Telecom": ["RF Engineering","Network Planning","5G/LTE","Optical Fibre Networks","Telecom Operations"]}');
select pg_temp.seed_tax(5, 'Information Technology', '{
  "Infrastructure and Cloud": ["Cloud Computing","AWS","Azure","DevOps","System Administration","Network Engineering"],
  "Security": ["Cybersecurity","Security Operations","Identity and Access Management"],
  "Data Platforms": ["SQL","Database Administration","Data Engineering"],
  "Legacy Systems": ["Mainframe","COBOL"],
  "Service Delivery": ["IT Project Management","IT Support","ERP/SAP"]}');
select pg_temp.seed_tax(6, 'Software Development', '{
  "Backend": ["Java","Python",".NET","Node.js","Go","PHP"],
  "Frontend": ["React","Angular","Vue.js","UI Engineering"],
  "Mobile": ["Android","iOS","Flutter","React Native"],
  "Quality": ["Testing and Automation","Performance Testing","Manual Testing"],
  "Leadership": ["Engineering Management","Solution Architecture","Product Management"]}');
select pg_temp.seed_tax(7, 'Artificial Intelligence and Machine Learning', '{
  "Applied AI": ["Machine Learning Engineering","Deep Learning","Natural Language Processing","Computer Vision","Generative AI","MLOps"],
  "Research": ["AI Research","Recommendation Systems"]}');
select pg_temp.seed_tax(8, 'Data Science and Analytics', '{
  "Analytics": ["Business Intelligence","Data Analysis","Power BI","Tableau","Product Analytics"],
  "Data Science": ["Statistical Modelling","Forecasting","Data Science"],
  "Data Platforms": ["Data Warehousing","ETL Development","Big Data"]}');
select pg_temp.seed_tax(9, 'Banking and Financial Services', '{
  "Banking": ["Retail Banking","Corporate Banking","Credit Analysis","Collections","Branch Operations"],
  "Markets and Risk": ["Risk Management","Treasury","Wealth Management","Investment Banking"],
  "Insurance": ["Underwriting","Claims","Insurance Sales"]}');
select pg_temp.seed_tax(10, 'Accounting and Finance', '{
  "Accounting": ["Accounts Payable","Accounts Receivable","General Ledger","Taxation","GST Compliance","Audit"],
  "Corporate Finance": ["Financial Planning and Analysis","Financial Reporting","Costing","Payroll"]}');
select pg_temp.seed_tax(11, 'Human Resources', '{
  "Talent": ["Talent Acquisition","HR Business Partner","Learning and Development","Campus Hiring"],
  "Operations": ["HR Operations","Payroll and Compliance","Compensation and Benefits","Employee Relations","HRIS"]}');
select pg_temp.seed_tax(12, 'Sales and Marketing', '{
  "Sales": ["B2B Sales","B2C Sales","Key Account Management","Inside Sales","Channel Sales","Business Development"],
  "Marketing": ["Brand Management","Product Marketing","Market Research","Trade Marketing"]}');
select pg_temp.seed_tax(13, 'Digital Marketing', '{
  "Performance": ["SEO","Paid Search","Paid Social","Marketing Analytics","Marketing Automation"],
  "Content and Social": ["Content Marketing","Social Media Management","Email Marketing","Copywriting"]}');
select pg_temp.seed_tax(14, 'Construction and Real Estate', '{
  "Construction": ["Building Construction","MEP Coordination","Site Supervision","Health, Safety and Environment","Estimation and Costing"],
  "Real Estate": ["Real Estate Sales","Property Management","Facilities Management","Leasing"]}');
select pg_temp.seed_tax(15, 'Architecture and Interior Design', '{
  "Architecture": ["Architectural Design","Urban Planning","Landscape Architecture","BIM Modelling"],
  "Interiors": ["Interior Design","Fit-out Management","3D Visualisation"]}');
select pg_temp.seed_tax(16, 'Manufacturing', '{
  "Operations": ["Production Planning","Lean Manufacturing","Plant Operations","Maintenance","Industrial Engineering"],
  "Quality and Safety": ["Quality Assurance","Quality Control","Six Sigma","EHS"]}');
select pg_temp.seed_tax(17, 'Oil and Gas', '{
  "Upstream": ["Drilling","Reservoir Engineering","Production Operations"],
  "Midstream and Downstream": ["Pipeline Engineering","Process Engineering","Refinery Operations","Process Safety","Inspection and Integrity"]}');
select pg_temp.seed_tax(18, 'Healthcare and Pharmaceuticals', '{
  "Clinical": ["Nursing","Clinical Research","Medical Coding","Hospital Administration","Laboratory Services"],
  "Pharma": ["Regulatory Affairs","Pharmacovigilance","Pharma Quality Assurance","Pharma Production","Medical Sales"]}');
select pg_temp.seed_tax(19, 'Education and Training', '{
  "Teaching": ["School Teaching","Higher Education Faculty","Special Education","Test Preparation"],
  "Learning": ["Instructional Design","Corporate Training","Academic Administration","EdTech Content"]}');
select pg_temp.seed_tax(20, 'Legal and Compliance', '{
  "Legal": ["Corporate Law","Litigation","Contract Drafting","Intellectual Property","Company Secretarial"],
  "Compliance": ["Regulatory Compliance","Data Privacy","Internal Audit","Anti-Money Laundering"]}');
select pg_temp.seed_tax(21, 'Supply Chain and Logistics', '{
  "Logistics": ["Warehouse Management","Transportation","Freight Forwarding","Last-Mile Delivery","Import-Export Documentation"],
  "Planning": ["Demand Planning","Inventory Management","Supply Planning"]}');
select pg_temp.seed_tax(22, 'Procurement', '{
  "Sourcing": ["Strategic Sourcing","Vendor Development","Category Management","Contracts and Tendering"],
  "Purchasing": ["Purchase Operations","Project Procurement","Indirect Procurement"]}');
select pg_temp.seed_tax(23, 'Hospitality and Tourism', '{
  "Hotels": ["Front Office","Housekeeping","Food and Beverage Service","Culinary","Revenue Management"],
  "Travel": ["Travel Operations","Ticketing","Event Management"]}');
select pg_temp.seed_tax(24, 'Customer Service', '{
  "Support": ["Voice Support","Chat and Email Support","Technical Support","Customer Success"],
  "Operations": ["Team Leadership","Quality Monitoring","Workforce Management"]}');
select pg_temp.seed_tax(25, 'Administration and Operations', '{
  "Administration": ["Office Administration","Executive Assistance","Front Desk","Travel and Facilities"],
  "Operations": ["Business Operations","Back Office Operations","Process Excellence","Data Entry"]}');
select pg_temp.seed_tax(26, 'Research and Development', '{
  "Research": ["Product Research","Scientific Research","Laboratory Research","Patent Analysis"],
  "Development": ["New Product Development","Prototyping","Testing and Validation"]}');
select pg_temp.seed_tax(27, 'Government and Public Sector', '{
  "Public Programmes": ["Programme Management","Public Policy","Monitoring and Evaluation","E-Governance"],
  "Public Works": ["Public Works Engineering","Urban Development","Tender Management"]}');
select pg_temp.seed_tax(28, 'Media and Communications', '{
  "Editorial": ["Journalism","Content Writing","Editing","Technical Writing"],
  "Production": ["Video Production","Graphic Design","Animation"],
  "Communications": ["Public Relations","Corporate Communications"]}');
select pg_temp.seed_tax(29, 'Business Consulting', '{
  "Consulting": ["Strategy Consulting","Management Consulting","Business Analysis","Change Management","Process Consulting"],
  "Specialist": ["Risk Advisory","Technology Consulting","ESG and Sustainability"]}');
select pg_temp.seed_tax(30, 'Other Industries', '{"General": ["Other"]}');

insert into public.skills (name) values
  ('MIDAS Civil'),('STAAD.Pro'),('SOFiSTiK'),('AutoCAD'),('Revit'),('Primavera P6'),('MS Project'),('ETABS'),('SAP2000'),('AASHTO'),
  ('Eurocode'),('IS Codes'),('IRC Codes'),('Java'),('Spring Boot'),('Python'),('Django'),('JavaScript'),('TypeScript'),('React'),
  ('Angular'),('Node.js'),('SQL'),('PostgreSQL'),('MySQL'),('MongoDB'),('AWS'),('Azure'),('Google Cloud'),('Docker'),
  ('Kubernetes'),('Terraform'),('Git'),('Jenkins'),('Selenium'),('COBOL'),('JCL'),('DB2'),('Power BI'),('Tableau'),
  ('Excel'),('Tally'),('SAP FICO'),('SAP MM'),('Salesforce'),('Google Ads'),('SEO'),('Figma'),('Machine Learning'),('TensorFlow'),
  ('PyTorch'),('NLP'),('Financial Modelling'),('GST'),('Payroll'),('Recruitment'),('Negotiation'),('Project Management'),('Six Sigma'),('Communication')
on conflict do nothing;
