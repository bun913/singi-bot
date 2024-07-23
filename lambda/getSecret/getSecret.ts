import axios from "axios"

const AWS_SESSION_TOKEN = process.env.AWS_SESSION_TOKEN || ""

export const getParameter = async (path: string): Promise<string> => {
  const res =  await axios.get(
    "http://localhost:2773/systemsmanager/parameters/get",
    {
      params: {
        name: encodeURIComponent(path)
      },
      headers: {
        "X-Aws-Parameters-Secrets-Token": AWS_SESSION_TOKEN,
      },
    }
  )
  return res.data.Parameter.Value
}
